import { DrizzleQueryError } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@jobtrack/shared';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { testConfig, TEST_ORIGIN, testMailer } from './test/helpers.js';

// Bu testler veritabanına dokunmaz; postgres istemcisi ilk sorguya kadar bağlanmaz.
const database = createDatabase(testConfig().DATABASE_URL);
const app = buildApp(testConfig(), { db: database.db, mailer: testMailer, rateLimit: false });

app.get('/api/__test/boom', { config: { access: 'public' } }, async () => {
  throw new Error('veritabanı parolası: gizli123');
});
app.post('/api/__test/echo', { config: { access: 'public' } }, async (request) => request.body);

beforeAll(() => app.ready());
afterAll(async () => {
  await app.close();
  await database.close();
});

describe('GET /api/health', () => {
  it('şemaya uygun yanıt döner', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(healthResponseSchema.parse(res.json())).toEqual({ status: 'ok' });
  });
});

describe('hata yönetimi (A10)', () => {
  it('500 hatasında ayrıntı sızdırmaz, iz ID verir', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/__test/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('gizli123');
    const body = res.json<{ error: string; traceId: string }>();
    expect(body.error).toBe('Beklenmeyen bir hata oluştu.');
    expect(body.traceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('bilinmeyen yol 404 döner', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/yok' });
    expect(res.statusCode).toBe(404);
  });

  it('istemcinin gönderdiği iz ID başlığını kullanmaz', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/yok',
      headers: { 'request-id': 'saldirgan-degeri' },
    });
    expect(res.json<{ traceId: string }>().traceId).not.toBe('saldirgan-degeri');
  });
});

describe('önbellek (ASVS 14.3)', () => {
  it('API yanıtları önbelleğe alınmaz', async () => {
    const ok = await app.inject({ method: 'GET', url: '/api/health' });
    const notFound = await app.inject({ method: 'GET', url: '/api/yok' });
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(notFound.headers['cache-control']).toBe('no-store');
  });
});

describe('hata logları hassas veri içermez (A09)', () => {
  it('veritabanı hatasında sorgu parametreleri ve PostgreSQL ayrıntısı loga yazılmaz', async () => {
    const lines: string[] = [];
    const logged = buildApp(testConfig({ LOG_LEVEL: 'error' }), {
      db: database.db,
      mailer: testMailer,
      rateLimit: false,
      logStream: { write: (line) => lines.push(line) },
    });
    const pgError = Object.assign(new Error('Key (email)=(gizli@example.com) already exists.'), {
      code: '23505',
      routine: '_bt_check_unique',
      constraint_name: 'users_email_key',
      detail: 'Key (email)=(gizli@example.com) already exists.',
    });
    logged.get('/api/__test/db', { config: { access: 'public' } }, async () => {
      throw new DrizzleQueryError(
        'insert into "users" ("email", "password_hash") values ($1, $2)',
        ['gizli@example.com', '$argon2id$gizli-hash'],
        pgError,
      );
    });
    await logged.ready();
    try {
      const res = await logged.inject({ method: 'GET', url: '/api/__test/db' });
      expect(res.statusCode).toBe(500);
    } finally {
      await logged.close();
    }
    const output = lines.join('\n');
    expect(output).toContain('users_email_key');
    expect(output).toContain('23505');
    expect(output).toContain('insert into');
    expect(output).not.toContain('gizli@example.com');
    expect(output).not.toContain('gizli-hash');
  });

  it('istek logunda sorgu dizesi (arama metni) yer almaz', async () => {
    const lines: string[] = [];
    const logged = buildApp(testConfig({ LOG_LEVEL: 'info' }), {
      db: database.db,
      mailer: testMailer,
      rateLimit: false,
      logStream: { write: (line) => lines.push(line) },
    });
    await logged.ready();
    try {
      await logged.inject({ method: 'GET', url: '/api/health?q=gizli-arama' });
    } finally {
      await logged.close();
    }
    const output = lines.join('\n');
    expect(output).toContain('"url":"/api/health"');
    expect(output).not.toContain('gizli-arama');
  });
});

describe('istek boyutu sınırı (A06)', () => {
  it('100 KB üstü gövdeyi 413 ile reddeder', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test/echo',
      headers: { 'content-type': 'application/json', origin: TEST_ORIGIN },
      payload: JSON.stringify({ x: 'a'.repeat(101 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
  });
});

describe('loadConfig', () => {
  it('geçersiz port ile başlamaz (fail closed)', () => {
    expect(() => testConfig({ PORT: 'abc' })).toThrow(/Geçersiz ortam değişkenleri/);
  });

  it('gizli anahtarlar eksikse başlamaz', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://a@b/c', APP_ORIGIN: TEST_ORIGIN })).toThrow(
      /APP_SECRET/,
    );
  });

  it('kısa şifreleme anahtarını reddeder', () => {
    expect(() => testConfig({ DATA_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })).toThrow(
      /DATA_ENCRYPTION_KEY/,
    );
  });

  it('kayıt varsayılan olarak kapalı, çerez varsayılan olarak Secure', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://a@b/c',
      APP_ORIGIN: TEST_ORIGIN,
      APP_SECRET: Buffer.alloc(32).toString('base64'),
      DATA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
      SMTP_HOST: 'smtp.example.com',
    });
    expect(config.REGISTRATION_ENABLED).toBe(false);
    expect(config.COOKIE_SECURE).toBe(true);
    expect(config.SMTP_SECURE).toBe(true);
  });

  it('test dışında SMTP olmadan başlamaz: kod gönderilemeyen kurulum kimseyi içeri alamaz', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://a@b/c',
        APP_ORIGIN: TEST_ORIGIN,
        APP_SECRET: Buffer.alloc(32).toString('base64'),
        DATA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
      }),
    ).toThrow(/SMTP_HOST/);
  });
});
