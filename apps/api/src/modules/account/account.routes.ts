import type { FastifyInstance } from 'fastify';
import { accountDeleteSchema, vitalsSchema, type EmailCodeTiming } from '@jobtrack/shared';
import { z } from 'zod';
import { hmacSha256 } from '../../lib/crypto.js';
import { unauthorized } from '../../lib/errors.js';
import { requireUserId } from '../../lib/http.js';
import type { AuthService } from '../auth/auth.service.js';
import type { AccountService } from './account.service.js';

export interface AccountRoutesOptions {
  service: AccountService;
  authService: AuthService;
  cookieName: string;
  deviceCookieName: string;
  cookieSecure: boolean;
  logKey: Buffer;
}

const exportQuerySchema = z.strictObject({ format: z.enum(['json', 'csv']) });
const TEN_MINUTES = 10 * 60 * 1000;

export async function accountRoutes(app: FastifyInstance, opts: AccountRoutesOptions) {
  const { service } = opts;

  /** FR-14: verinin tamamını indir. Dosya adı tarih içerir; yanıt önbelleğe alınmaz. */
  app.get(
    '/export',
    { config: { rateLimit: { max: 10, timeWindow: TEN_MINUTES } } },
    async (request, reply) => {
      const userId = requireUserId(request);
      const { format } = exportQuerySchema.parse(request.query);
      const date = new Date().toISOString().slice(0, 10);
      reply.header('content-disposition', `attachment; filename="jobtrack-${date}.${format}"`);
      if (format === 'csv') {
        reply.type('text/csv; charset=utf-8');
        return service.exportCsv(userId, request.ip);
      }
      reply.type('application/json; charset=utf-8');
      return JSON.stringify(await service.exportJson(userId, request.ip), null, 2);
    },
  );

  /** FR-17: yaklaşan mülakatlar takvim dosyası olarak. */
  app.get('/calendar.ics', async (request, reply) => {
    const userId = requireUserId(request);
    reply
      .type('text/calendar; charset=utf-8')
      .header('content-disposition', 'attachment; filename="jobtrack-mulakatlar.ics"');
    return service.upcomingInterviewsIcs(userId);
  });

  /** FR-14, ADR-0007: silme onayı için e-postaya 2 dakika geçerli kod gönderir. */
  app.post(
    '/deletion-code',
    { config: { rateLimit: { max: 5, timeWindow: TEN_MINUTES } } },
    async (request): Promise<EmailCodeTiming> => {
      const session = request.session;
      if (!session) throw unauthorized();
      return opts.authService.requestDeletionCode(session);
    },
  );

  /**
   * FR-14: hesabı ve tüm veriyi kalıcı olarak sil. Parola ve (MFA açıksa) ikinci faktör yeniden istenir.
   * Denetim kaydı da kullanıcıyla birlikte silinir (KVKK); olay yalnızca kimliksiz olarak loglanır.
   */
  app.delete(
    '/',
    { config: { rateLimit: { max: 5, timeWindow: TEN_MINUTES } } },
    async (request, reply) => {
      const userId = requireUserId(request);
      const input = accountDeleteSchema.parse(request.body);
      const session = request.session;
      if (!session) return reply.status(401).send();
      await opts.authService.deleteAccount(session, input);
      request.log.info(
        { event: 'account_deleted', subject: hmacSha256(opts.logKey, userId).toString('hex') },
        'hesap silindi',
      );
      for (const name of [opts.cookieName, opts.deviceCookieName]) {
        reply.clearCookie(name, {
          path: '/',
          secure: opts.cookieSecure,
          httpOnly: true,
          sameSite: 'lax',
        });
      }
      return reply.status(204).send();
    },
  );
}

/**
 * NFR-03: gerçek kullanıcıların Core Web Vitals ölçümleri. Oturum gerektirmez (giriş sayfası da ölçülür);
 * yalnızca metrik, değer ve rota kalıbı loglanır — kişisel veri yok.
 */
export async function vitalsRoutes(app: FastifyInstance) {
  app.post(
    '/',
    { config: { access: 'public', rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const metric = vitalsSchema.parse(request.body);
      request.log.info({ vitals: metric }, 'web-vitals');
      return reply.status(204).send();
    },
  );
}
