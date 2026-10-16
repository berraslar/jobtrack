import { randomUUID } from 'node:crypto';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { HealthResponse } from '@jobtrack/shared';
import type { Config } from './config.js';
import type { Db } from './db/client.js';
import { deriveKey } from './lib/crypto.js';
import { AppError, toLoggableError } from './lib/errors.js';
import { createSmtpMailer, type Mailer } from './lib/mailer.js';
import { createPwnedChecker, type PwnedChecker } from './lib/password.js';
import { accountRoutes, vitalsRoutes } from './modules/account/account.routes.js';
import { AccountService } from './modules/account/account.service.js';
import { activityRoutes, applicationRoutes } from './modules/applications/applications.routes.js';
import { ApplicationService } from './modules/applications/applications.service.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { companyRoutes } from './modules/companies/companies.routes.js';
import { CompanyService } from './modules/companies/companies.service.js';
import {
  aiStatusRoutes,
  applicationTailorRoutes,
  masterCvRoutes,
  tailoredCvRoutes,
} from './modules/cv-tailor/cv-tailor.routes.js';
import { CvTailorService } from './modules/cv-tailor/cv-tailor.service.js';
import { createAiProvider, type CvTailorProvider } from './modules/ai/index.js';
import { cvVersionRoutes } from './modules/cv-versions/cv-versions.routes.js';
import { CvVersionService } from './modules/cv-versions/cv-versions.service.js';
import {
  createCvParserClient,
  disabledExtractor,
  type TextExtractor,
} from './modules/profile/cv-parser-client.js';
import { profileRoutes } from './modules/profile/profile.routes.js';
import { ProfileService } from './modules/profile/profile.service.js';
import { settingsRoutes } from './modules/settings/settings.routes.js';
import { StatsService, statsRoutes } from './modules/stats/stats.routes.js';
import authGuard from './plugins/auth-guard.js';

/** İstek gövdesi üst sınırı: 100 KB (A06). */
const BODY_LIMIT_BYTES = 100 * 1024;

/** Çerçevenin ürettiği (AppError olmayan) hatalar için istemcinin çevirebileceği kod. */
const KNOWN_STATUS_ERRORS = new Map([
  [413, { error: 'Gönderilen veri çok büyük.', code: 'payload_too_large' }],
  [415, { error: 'Bu içerik türü desteklenmiyor.', code: 'unsupported_media_type' }],
  [429, { error: 'Çok fazla istek. Lütfen biraz sonra tekrar deneyin.', code: 'rate_limited' }],
]);

export interface AppDeps {
  db: Db;
  /** Testlerde HIBP yerine sahte denetleyici verilir. */
  isPwned?: PwnedChecker | null;
  now?: () => Date;
  /** IP bazlı hız sınırı. Yalnızca testlerde kapatılır; varsayılan açık. */
  rateLimit?: boolean;
  /** Testlerde log çıktısını yakalamak için. Verilmezse stdout. */
  logStream?: { write: (line: string) => void };
  /** E-posta gönderici (ADR-0007). Verilmezse SMTP ayarlarından kurulur; testlerde bellek içi. */
  mailer?: Mailer;
  /** CV metin çıkarıcı (ADR-0008). Verilmezse CV_PARSER_URL'den kurulur; testlerde sahte. */
  extractText?: TextExtractor;
  /** ADR-0010: yapay zekâ sağlayıcısı; verilmezse yapılandırmadan seçilir, null = kapalı. */
  ai?: CvTailorProvider | null;
}

export function buildApp(config: Config, deps: AppDeps): FastifyInstance {
  const app = Fastify({
    bodyLimit: BODY_LIMIT_BYTES,
    // İz ID'si sunucuda üretilir; istemcinin gönderdiği başlığa güvenilmez.
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    // Üretimde yalnızca Docker iç ağındaki Caddy'ye güvenilir (X-Forwarded-For).
    trustProxy: config.NODE_ENV === 'production' ? 'uniquelocal' : false,
    logger: {
      level: config.LOG_LEVEL,
      // Hassas alanlar loglanmaz (A09). İstek gövdesi zaten hiç loglanmaz.
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.headers["x-csrf-token"]',
          'res.headers["set-cookie"]',
        ],
        censor: '[gizli]',
      },
      // Sorgu dizesi loglanmaz: arama metni (`?q=`) kullanıcı verisidir (veri minimizasyonu, KVKK).
      serializers: {
        req: (req: FastifyRequest) => ({
          method: req.method,
          url: req.url.split('?', 1)[0] ?? '',
          host: req.host,
          remoteAddress: req.ip,
        }),
      },
      ...(deps.logStream ? { stream: deps.logStream } : {}),
    },
  });

  // Kimlik ve CSRF bilgisi içeren yanıtlar hiçbir önbellekte tutulmaz (ASVS 14.3).
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('cache-control', 'no-store');
    return payload;
  });

  // `__Host-` öneki: yalnızca Secure, Path=/ ve Domain'siz çerez kabul edilir (A07).
  const cookieName = config.COOKIE_SECURE ? '__Host-session' : 'jobtrack_session';
  const deviceCookieName = config.COOKIE_SECURE ? '__Host-device' : 'jobtrack_device';
  const mailer =
    deps.mailer ??
    createSmtpMailer({
      host: config.SMTP_HOST ?? 'localhost',
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      user: config.SMTP_USER,
      password: config.SMTP_PASSWORD,
      from: config.MAIL_FROM,
    });
  const authService = new AuthService({
    db: deps.db,
    keys: {
      csrf: deriveKey(config.APP_SECRET, 'jobtrack/csrf'),
      ipHash: deriveKey(config.APP_SECRET, 'jobtrack/ip-hash'),
      dataEncryption: config.DATA_ENCRYPTION_KEY,
      emailCode: deriveKey(config.APP_SECRET, 'jobtrack/email-code'),
    },
    mailer,
    registrationEnabled: config.REGISTRATION_ENABLED,
    isPwned:
      deps.isPwned !== undefined ? deps.isPwned : config.HIBP_ENABLED ? createPwnedChecker() : null,
    ...(deps.now ? { now: deps.now } : {}),
  });

  const companyService = new CompanyService(deps.db, deps.now);
  const cvVersionService = new CvVersionService(deps.db);
  const applicationService = new ApplicationService({
    db: deps.db,
    timeZone: config.APP_TIMEZONE,
    ...(deps.now ? { now: deps.now } : {}),
  });

  const extractText =
    deps.extractText ??
    (config.CV_PARSER_URL ? createCvParserClient(config.CV_PARSER_URL) : disabledExtractor);
  const profileService = new ProfileService({
    db: deps.db,
    extractText,
    ...(deps.now ? { now: deps.now } : {}),
  });

  // ADR-0010: sağlayıcı yapılandırmadan; testler kendi sahte sağlayıcısını verebilir.
  const aiProvider = deps.ai === undefined ? createAiProvider(config) : deps.ai;
  const cvTailorService = new CvTailorService({
    db: deps.db,
    ai: aiProvider,
    extractText,
    ...(deps.now ? { now: deps.now } : {}),
  });
  const statsService = new StatsService(deps.db, config.APP_TIMEZONE, deps.now);
  const accountService = new AccountService({
    db: deps.db,
    ipHashKey: deriveKey(config.APP_SECRET, 'jobtrack/ip-hash'),
    ...(deps.now ? { now: deps.now } : {}),
  });

  // Merkezi hata yöneticisi (A10): kullanıcıya genel mesaj + iz ID'si, ayrıntı loga.
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: 'İstek geçersiz.',
        code: 'validation_failed',
        traceId: request.id,
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    if (error instanceof AppError) {
      request.log.info({ code: error.code, statusCode: error.statusCode }, 'uygulama hatası');
      return reply
        .status(error.statusCode)
        .send({ error: error.message, code: error.code, traceId: request.id });
    }
    const statusCode =
      error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;
    if (statusCode >= 500) {
      request.log.error({ error: toLoggableError(error) }, 'işlenmeyen hata');
    } else {
      request.log.info({ err: { message: error.message } }, 'istemci hatası');
    }
    const known = KNOWN_STATUS_ERRORS.get(statusCode);
    const message = known
      ? known.error
      : statusCode >= 500
        ? 'Beklenmeyen bir hata oluştu.'
        : 'İstek işlenemedi.';
    return reply
      .status(statusCode)
      .send({ error: message, ...(known ? { code: known.code } : {}), traceId: request.id });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({ error: 'Bulunamadı.', code: 'not_found', traceId: request.id }),
  );

  app.register(cookie);
  // Genel IP başına sınır; giriş uçlarında daha sıkı sınırlar rota ayarındadır (A07, DoS).
  if (deps.rateLimit ?? true) {
    app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' });
  }
  app.register(authGuard, {
    authService,
    appOrigin: config.APP_ORIGIN,
    cookieName,
    cookieSecure: config.COOKIE_SECURE,
  });

  app.register(
    async (api) => {
      api.get('/health', { config: { access: 'public' } }, async (): Promise<HealthResponse> => ({
        status: 'ok',
      }));
      await api.register(authRoutes, {
        prefix: '/auth',
        authService,
        cookieName,
        deviceCookieName,
        cookieSecure: config.COOKIE_SECURE,
      });
      // Aşağıdaki tüm rotalar tam oturum ister (varsayılan erişim seviyesi 'user').
      await api.register(companyRoutes, { prefix: '/companies', service: companyService });
      await api.register(cvVersionRoutes, { prefix: '/cv-versions', service: cvVersionService });
      await api.register(profileRoutes, { prefix: '/profile', service: profileService });
      await api.register(applicationRoutes, {
        prefix: '/applications',
        service: applicationService,
      });
      await api.register(activityRoutes, { prefix: '/activities', service: applicationService });
      await api.register(applicationTailorRoutes, {
        prefix: '/applications',
        service: cvTailorService,
      });
      await api.register(masterCvRoutes, { prefix: '/master-cv', service: cvTailorService });
      await api.register(tailoredCvRoutes, { prefix: '/tailored-cvs', service: cvTailorService });
      await api.register(aiStatusRoutes, {
        prefix: '/ai',
        service: cvTailorService,
        model: aiProvider?.model ?? null,
      });
      await api.register(settingsRoutes, { prefix: '/settings', db: deps.db });
      await api.register(statsRoutes, { prefix: '/stats', service: statsService });
      await api.register(accountRoutes, {
        prefix: '/account',
        service: accountService,
        authService,
        cookieName,
        deviceCookieName,
        cookieSecure: config.COOKIE_SECURE,
        logKey: deriveKey(config.APP_SECRET, 'jobtrack/log-subject'),
      });
      await api.register(vitalsRoutes, { prefix: '/vitals' });
    },
    { prefix: '/api' },
  );

  return app;
}
