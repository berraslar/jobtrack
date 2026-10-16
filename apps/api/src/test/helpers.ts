import { fileURLToPath } from 'node:url';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { loadConfig, type Config } from '../config.js';
import type { Mailer, MailMessage } from '../lib/mailer.js';
import { runMigrations } from '../db/migrate.js';

export const TEST_ORIGIN = 'http://localhost:8080';
export const COOKIE_NAME = '__Host-session';
export const DEVICE_COOKIE_NAME = '__Host-device';

/** Bellek içi posta kutusu (ADR-0007): testler gönderilen kodu buradan okur. */
export const outbox: MailMessage[] = [];
export const testMailer: Mailer = {
  send(message) {
    outbox.push(message);
    return Promise.resolve();
  },
};

/** Bu adrese gönderilmiş son e-postadaki 6 haneli kod. */
export function lastEmailCode(to: string): string {
  const message = outbox.findLast((m) => m.to === to);
  const code = message?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error(`${to} için kod yok`);
  return code;
}

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://kullanilmaz:kullanilmaz@127.0.0.1:1/kullanilmaz',
    APP_ORIGIN: TEST_ORIGIN,
    APP_SECRET: Buffer.alloc(32, 1).toString('base64'),
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString('base64'),
    REGISTRATION_ENABLED: 'true',
    HIBP_ENABLED: 'false',
    COOKIE_SECURE: 'true',
    ...overrides,
  });
}

const BOOTSTRAP_SQL = fileURLToPath(
  new URL('../../../../infra/postgres/bootstrap.sql', import.meta.url),
);

export interface TestDatabase {
  appUrl: string;
  adminUrl: string;
  stop: () => Promise<void>;
}

/**
 * Gerçek PostgreSQL 18 konteyneri (Testcontainers). Üretimdekiyle aynı rol betiği ve migration'lar çalışır;
 * böylece RLS ve yetkiler sahte değil, gerçek veritabanında test edilir.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:18-alpine')
    .withDatabase('jobtrack')
    .withUsername('jobtrack_admin')
    .withPassword('test-admin')
    .withCopyFilesToContainer([{ source: BOOTSTRAP_SQL, target: '/bootstrap/bootstrap.sql' }])
    .start();

  const result = await container.exec([
    'psql',
    '-U',
    'jobtrack_admin',
    '-d',
    'jobtrack',
    '-v',
    'dbname=jobtrack',
    '-v',
    'app_password=test-app',
    '-v',
    'migrator_password=test-migrator',
    '-f',
    '/bootstrap/bootstrap.sql',
  ]);
  if (result.exitCode !== 0) throw new Error(`bootstrap başarısız: ${result.output}`);

  const url = (user: string, password: string) =>
    `postgres://${user}:${password}@${container.getHost()}:${String(container.getPort())}/jobtrack`;
  await runMigrations(url('jobtrack_migrator', 'test-migrator'), undefined, () => undefined);

  return {
    appUrl: url('jobtrack_app', 'test-app'),
    adminUrl: url('jobtrack_admin', 'test-admin'),
    stop: async () => {
      await container.stop();
    },
  };
}

/** Tarayıcı gibi davranan istemci: çerezi ve CSRF token'ını taşır, Origin başlığını gönderir. */
export class TestAgent {
  token: string | undefined;
  csrf: string | undefined;
  /** Güvenilen cihaz çerezi (e-posta kodu bir kez doğrulanınca gelir). */
  device: string | undefined;

  constructor(private readonly app: FastifyInstance) {}

  async request(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<LightMyRequestResponse> {
    const res = await this.app.inject({
      method,
      url,
      ...(body !== undefined
        ? { payload: Buffer.isBuffer(body) ? body : (body as Record<string, unknown>) }
        : {}),
      headers: {
        origin: TEST_ORIGIN,
        ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}),
        ...(this.csrf ? { 'x-csrf-token': this.csrf } : {}),
        ...headers,
      },
    });
    const cookie = res.cookies.find((c) => c.name === COOKIE_NAME);
    if (cookie) this.token = cookie.value === '' ? undefined : cookie.value;
    const device = res.cookies.find((c) => c.name === DEVICE_COOKIE_NAME);
    if (device) this.device = device.value === '' ? undefined : device.value;
    return res;
  }

  private cookieHeader(): string {
    return [
      this.token ? `${COOKIE_NAME}=${this.token}` : null,
      this.device ? `${DEVICE_COOKIE_NAME}=${this.device}` : null,
    ]
      .filter(Boolean)
      .join('; ');
  }

  /** E-posta kodu adımı istendiyse posta kutusundaki son kodla tamamlar (FR-18/FR-19). */
  async completeEmailStep(email: string, res: LightMyRequestResponse): Promise<void> {
    if (res.statusCode >= 300 || res.json<{ status?: string }>().status !== 'email_required')
      return;
    const verified = await this.request('POST', '/api/auth/email/verify', {
      code: lastEmailCode(email),
    });
    if (verified.statusCode !== 200) throw new Error(`e-posta doğrulanamadı: ${verified.body}`);
  }

  /** /me çağırıp CSRF token'ını alır (arayüz de böyle yapar). */
  async refreshCsrf(): Promise<void> {
    const res = await this.request('GET', '/api/auth/me');
    this.csrf = res.statusCode === 200 ? res.json<{ csrfToken: string }>().csrfToken : undefined;
  }

  /** Kayıt + e-posta doğrulaması; kayıt yanıtını döner. */
  async register(email: string, password: string): Promise<LightMyRequestResponse> {
    const res = await this.request('POST', '/api/auth/register', { email, password });
    await this.completeEmailStep(email, res);
    await this.refreshCsrf();
    return res;
  }

  /** Giriş (gerekirse e-posta kodu adımıyla); giriş yanıtını döner. */
  async login(email: string, password: string): Promise<LightMyRequestResponse> {
    const res = await this.request('POST', '/api/auth/login', { email, password });
    await this.completeEmailStep(email, res);
    await this.refreshCsrf();
    return res;
  }
}
