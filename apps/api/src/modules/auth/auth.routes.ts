import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  emailVerifyRequestSchema,
  loginRequestSchema,
  mfaEnableRequestSchema,
  mfaVerifyRequestSchema,
  registerRequestSchema,
  type EmailCodeTiming,
  type LoginResponse,
  type MeResponse,
  type MfaEnableResponse,
  type MfaSetupResponse,
  type SessionsResponse,
} from '@jobtrack/shared';
import { unauthorized } from '../../lib/errors.js';
import type {
  AuthService,
  AuthenticatedSession,
  IssuedDevice,
  IssuedSession,
  RequestMeta,
} from './auth.service.js';

export interface AuthRoutesOptions {
  authService: AuthService;
  cookieName: string;
  deviceCookieName: string;
  /** Bekleyen kaydın çerezi (FR-01/FR-18). */
  registrationCookieName: string;
  cookieSecure: boolean;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

export async function authRoutes(app: FastifyInstance, opts: AuthRoutesOptions) {
  const { authService } = opts;

  const setSessionCookie = (reply: FastifyReply, session: IssuedSession) =>
    reply.setCookie(opts.cookieName, session.token, {
      path: '/',
      httpOnly: true,
      secure: opts.cookieSecure,
      sameSite: 'lax',
      maxAge: session.maxAgeSeconds,
    });
  // FR-19: güvenilen cihaz çerezi; yalnızca rastgele bir token taşır, sunucuda özeti saklanır.
  const setDeviceCookie = (reply: FastifyReply, device: IssuedDevice) =>
    reply.setCookie(opts.deviceCookieName, device.token, {
      path: '/',
      httpOnly: true,
      secure: opts.cookieSecure,
      sameSite: 'lax',
      maxAge: device.maxAgeSeconds,
    });
  const meta = (request: FastifyRequest): RequestMeta => {
    const userAgent = request.headers['user-agent'];
    return {
      ip: request.ip,
      userAgent: typeof userAgent === 'string' ? userAgent : null,
      deviceToken: request.cookies[opts.deviceCookieName] ?? null,
    };
  };
  const clearSessionCookie = (reply: FastifyReply) =>
    reply.clearCookie(opts.cookieName, { path: '/', secure: opts.cookieSecure, sameSite: 'lax' });

  /**
   * FR-01/FR-18: kayıt hesap açmaz; e-posta kodu doğrulanınca açılır. Yanıt, adresin kayıtlı olup
   * olmadığından bağımsız olarak aynıdır (A07). 202: istek alındı, hesap henüz yok.
   */
  app.post(
    '/register',
    { config: { access: 'public', rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request, reply): Promise<LoginResponse> => {
      const input = registerRequestSchema.parse(request.body);
      const { registration, timing } = await authService.register(input);
      reply.status(202).setCookie(opts.registrationCookieName, registration.token, {
        path: '/',
        httpOnly: true,
        secure: opts.cookieSecure,
        sameSite: 'lax',
        maxAge: registration.maxAgeSeconds,
      });
      return { status: 'email_required', ...timing };
    },
  );

  app.post(
    '/register/verify',
    { config: { access: 'public', rateLimit: { max: 10, timeWindow: FIFTEEN_MINUTES } } },
    async (request, reply): Promise<LoginResponse> => {
      const input = emailVerifyRequestSchema.parse(request.body);
      const result = await authService.verifyRegistration(
        request.cookies[opts.registrationCookieName],
        input.code,
        meta(request),
      );
      reply.clearCookie(opts.registrationCookieName, {
        path: '/',
        secure: opts.cookieSecure,
        httpOnly: true,
        sameSite: 'lax',
      });
      setSessionCookie(reply, result.session);
      setDeviceCookie(reply, result.device);
      return { status: 'ok', failedAttemptsSinceLastLogin: 0 };
    },
  );

  app.post(
    '/register/resend',
    { config: { access: 'public', rateLimit: { max: 5, timeWindow: FIFTEEN_MINUTES } } },
    async (request): Promise<EmailCodeTiming> =>
      authService.resendRegistrationCode(request.cookies[opts.registrationCookieName]),
  );

  app.post(
    '/login',
    { config: { access: 'public', rateLimit: { max: 10, timeWindow: FIFTEEN_MINUTES } } },
    async (request, reply): Promise<LoginResponse> => {
      const input = loginRequestSchema.parse(request.body);
      const result = await authService.login(input, meta(request));
      setSessionCookie(reply, result.session);
      if (result.status === 'mfa_required') return { status: 'mfa_required' };
      if (result.status === 'email_required') return { status: 'email_required', ...result.timing };
      return { status: 'ok', failedAttemptsSinceLastLogin: result.failedAttemptsSinceLastLogin };
    },
  );

  /** FR-18/FR-19: e-posta kodu adımı (yarım oturum). */
  app.post(
    '/email/verify',
    { config: { access: 'pending', rateLimit: { max: 10, timeWindow: FIFTEEN_MINUTES } } },
    async (request, reply): Promise<LoginResponse> => {
      const input = emailVerifyRequestSchema.parse(request.body);
      const result = await authService.verifyEmail(
        requireSession(request),
        input.code,
        meta(request),
      );
      setSessionCookie(reply, result.session);
      setDeviceCookie(reply, result.device);
      return { status: 'ok', failedAttemptsSinceLastLogin: result.failedAttemptsSinceLastLogin };
    },
  );

  app.post(
    '/email/resend',
    { config: { access: 'pending', rateLimit: { max: 5, timeWindow: FIFTEEN_MINUTES } } },
    async (request): Promise<EmailCodeTiming> =>
      authService.resendEmailCode(requireSession(request)),
  );

  app.post(
    '/mfa/verify',
    { config: { access: 'pending', rateLimit: { max: 10, timeWindow: FIFTEEN_MINUTES } } },
    async (request, reply): Promise<LoginResponse> => {
      const input = mfaVerifyRequestSchema.parse(request.body);
      const result = await authService.verifyMfa(requireSession(request), input, meta(request));
      setSessionCookie(reply, result.session);
      return { status: 'ok', failedAttemptsSinceLastLogin: result.failedAttemptsSinceLastLogin };
    },
  );

  app.get('/me', async (request): Promise<MeResponse> => authService.me(requireSession(request)));

  app.post('/logout', async (request, reply) => {
    await authService.logout(requireSession(request));
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.get('/sessions', async (request): Promise<SessionsResponse> => ({
    sessions: await authService.listSessions(requireSession(request)),
  }));

  app.delete('/sessions', async (request, reply) => {
    await authService.logoutAll(requireSession(request), meta(request));
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.post('/mfa/setup', async (request): Promise<MfaSetupResponse> =>
    authService.setupMfa(requireSession(request)),
  );

  app.post(
    '/mfa/enable',
    { config: { rateLimit: { max: 10, timeWindow: FIFTEEN_MINUTES } } },
    async (request): Promise<MfaEnableResponse> => {
      const input = mfaEnableRequestSchema.parse(request.body);
      return authService.enableMfa(requireSession(request), input, meta(request));
    },
  );
}

function requireSession(request: FastifyRequest): AuthenticatedSession {
  // auth-guard bu noktaya oturumsuz gelinmesine izin vermez; yine de fail closed.
  if (!request.session) throw unauthorized();
  return request.session;
}
