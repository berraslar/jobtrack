import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { safeEqual } from '../lib/crypto.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import type { AuthService, AuthenticatedSession } from '../modules/auth/auth.service.js';

/**
 * Rota erişim seviyesi. Belirtilmezse 'user' (secure by default):
 *  - public:  oturum gerekmez (kayıt, giriş, sağlık)
 *  - pending: yalnızca MFA bekleyen yarım oturum (ikinci adım)
 *  - user:    tam oturum; durum değiştiren isteklerde CSRF token'ı zorunlu
 */
export type AccessLevel = 'public' | 'pending' | 'user';

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: AccessLevel;
  }
  interface FastifyRequest {
    session: AuthenticatedSession | null;
  }
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface AuthGuardOptions {
  authService: AuthService;
  appOrigin: string;
  cookieName: string;
  cookieSecure: boolean;
}

async function authGuard(app: FastifyInstance, opts: AuthGuardOptions) {
  app.decorateRequest('session', null);

  app.addHook('onRequest', async (request: FastifyRequest) => {
    // A08: durum değiştiren her istek aynı kökenden gelmeli.
    if (UNSAFE_METHODS.has(request.method) && !isSameOrigin(request, opts.appOrigin)) {
      throw forbidden();
    }
  });

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Rota bulunamadıysa 404 işleyicisi devreye girer; burada bir şey yapma.
    if (request.is404) return;
    const access = request.routeOptions.config.access ?? 'user';
    if (access === 'public') return;

    const token = request.cookies[opts.cookieName];
    const session = token ? await opts.authService.authenticate(token) : null;
    if (!session) {
      // `__Host-` çerezi yalnızca Secure bayrağıyla silinebilir; tarayıcı aksi hâlde yok sayar.
      if (token) {
        reply.clearCookie(opts.cookieName, {
          path: '/',
          secure: opts.cookieSecure,
          httpOnly: true,
          sameSite: 'lax',
        });
      }
      throw unauthorized();
    }

    if (access === 'pending' ? !session.mfaPending : session.mfaPending) throw unauthorized();

    if (access === 'user' && UNSAFE_METHODS.has(request.method)) {
      const header = request.headers['x-csrf-token'];
      const expected = opts.authService.csrfTokenFor(session.token);
      if (typeof header !== 'string' || !safeEqual(header, expected)) throw forbidden();
    }

    request.session = session;
  });
}

function isSameOrigin(request: FastifyRequest, appOrigin: string): boolean {
  const origin = request.headers.origin;
  if (typeof origin === 'string') return origin === appOrigin;
  // Origin başlığı olmayan eski istemciler: tarayıcının Fetch Metadata başlığına bak.
  return request.headers['sec-fetch-site'] === 'same-origin';
}

export default fp(authGuard, { name: 'auth-guard', dependencies: ['@fastify/cookie'] });
