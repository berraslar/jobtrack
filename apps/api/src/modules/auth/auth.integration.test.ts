import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createDatabase, withUserTx, type Database } from '../../db/client.js';
import { generateTotp } from '../../lib/totp.js';
import { claimTotpStep } from './auth.repository.js';
import {
  COOKIE_NAME,
  startTestDatabase,
  TestAgent,
  testConfig,
  type TestDatabase,
  testMailer,
  DEVICE_COOKIE_NAME,
  REGISTRATION_COOKIE_NAME,
  lastEmailCode,
  outbox,
} from '../../test/helpers.js';

const PASSWORD = 'cok-guvenli-parola-2026';
const BREACHED = 'sizmis-bir-parola-123';

let testDb: TestDatabase;
let database: Database;
let admin: postgres.Sql;
let app: FastifyInstance;
let clockOffsetMs = 0;
const now = () => new Date(Date.now() + clockOffsetMs);
let emailCounter = 0;
const uniqueEmail = () => `kullanici${String(++emailCounter)}@example.com`;

function build(overrides: Record<string, string> = {}, rateLimit = false) {
  return buildApp(testConfig(overrides), {
    db: database.db,
    mailer: testMailer,
    isPwned: (password) => Promise.resolve(password === BREACHED),
    now,
    rateLimit,
  });
}

beforeAll(async () => {
  testDb = await startTestDatabase();
  database = createDatabase(testDb.appUrl);
  admin = postgres(testDb.adminUrl, { max: 1, onnotice: () => undefined });
  app = build();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await database.close();
  await admin.end();
  await testDb.stop();
});

beforeEach(() => {
  clockOffsetMs = 0;
});

async function enableMfa(agent: TestAgent): Promise<{ secret: string; recoveryCodes: string[] }> {
  const setup = await agent.request('POST', '/api/auth/mfa/setup');
  expect(setup.statusCode).toBe(200);
  const uri = new URL(setup.json<{ otpauthUri: string }>().otpauthUri);
  const secret = uri.searchParams.get('secret') ?? '';
  // Kurulumda kullanılan kod, girişte tekrar kullanılamasın diye bir önceki adımdan üretilir.
  const enable = await agent.request('POST', '/api/auth/mfa/enable', {
    code: generateTotp(secret, now().getTime() - 30_000),
    password: PASSWORD,
  });
  expect(enable.statusCode).toBe(200);
  return { secret, recoveryCodes: enable.json<{ recoveryCodes: string[] }>().recoveryCodes };
}

describe('veritabanı rolleri ve RLS (A01, ADR-0002)', () => {
  it('uygulama rolü app.user_id ayarı olmadan hiçbir kullanıcıyı göremez', async () => {
    await new TestAgent(app).register(uniqueEmail(), PASSWORD);
    const sql = postgres(testDb.appUrl, { max: 1 });
    try {
      expect(await sql`select id from users`).toHaveLength(0);
      expect(await sql`select id from sessions`).toHaveLength(0);
    } finally {
      await sql.end();
    }
  });

  it('A kullanıcısının bağlamında B kullanıcısının satırları görünmez ve değiştirilemez', async () => {
    const a = new TestAgent(app);
    const b = new TestAgent(app);
    const emailA = uniqueEmail();
    const emailB = uniqueEmail();
    await a.register(emailA, PASSWORD);
    await b.register(emailB, PASSWORD);
    const [userA] = await admin<{ id: string }[]>`select id from users where email = ${emailA}`;
    const [userB] = await admin<{ id: string }[]>`select id from users where email = ${emailB}`;

    const sql = postgres(testDb.appUrl, { max: 1 });
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('app.user_id', ${userA?.id ?? ''}, true)`;
        const visible = await tx<{ email: string }[]>`select email from users`;
        expect(visible.map((u) => u.email)).toEqual([emailA]);
        const updated = await tx`update users set locale = 'en' where id = ${userB?.id ?? ''}`;
        expect(updated.count).toBe(0);
      });
      // Hata transaction'ı iptal ettiği için ekleme denemesi ayrı bir transaction'da yapılır.
      await expect(
        sql.begin(async (tx) => {
          await tx`select set_config('app.user_id', ${userA?.id ?? ''}, true)`;
          await tx`insert into audit_log (user_id, event) values (${userB?.id ?? ''}, 'login_success')`;
        }),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await sql.end();
    }
  });

  it('uygulama rolü denetim kaydını değiştiremez veya silemez (yalnızca ekleme)', async () => {
    const sql = postgres(testDb.appUrl, { max: 1 });
    try {
      await expect(sql`delete from audit_log`).rejects.toThrow(/permission denied/);
      await expect(sql`update audit_log set event = 'register'`).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await sql.end();
    }
  });

  it('uygulama rolü tablo oluşturamaz ve migration kaydına erişemez', async () => {
    const sql = postgres(testDb.appUrl, { max: 1 });
    try {
      await expect(sql`create table kotu (id int)`).rejects.toThrow(/permission denied/);
      await expect(sql`select * from schema_migrations`).rejects.toThrow(/permission denied/);
    } finally {
      await sql.end();
    }
  });
});

describe('kayıt (FR-01, FR-18)', () => {
  const startRegistration = async (email = uniqueEmail()) => {
    const agent = new TestAgent(app);
    const res = await agent.request('POST', '/api/auth/register', { email, password: PASSWORD });
    expect(res.statusCode).toBe(202);
    return { agent, email, res };
  };
  const verify = (agent: TestAgent, code: string) =>
    agent.request('POST', '/api/auth/register/verify', { code });
  const other = (code: string) => (code === '000000' ? '111111' : '000000');

  it('kayıt hesap açmaz; kod doğrulanınca e-postası doğrulanmış hesap ve tam oturum açılır', async () => {
    const agent = new TestAgent(app);
    const email = uniqueEmail();
    const res = await agent.request('POST', '/api/auth/register', {
      email: email.toUpperCase(),
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({
      status: 'email_required',
      expiresInSeconds: 120,
      resendInSeconds: 60,
    });
    // Oturum yok; yalnızca bekleyen kaydın çerezi var.
    expect(res.cookies.find((c) => c.name === COOKIE_NAME)).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === REGISTRATION_COOKIE_NAME);
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    expect(cookie?.domain).toBeUndefined();
    expect(await admin`select id from users where email = ${email}`).toHaveLength(0);
    expect((await agent.request('GET', '/api/auth/me')).statusCode).toBe(401);

    const code = lastEmailCode(email);
    expect(outbox.at(-1)?.subject).toBe('JobTrack kayıt doğrulama kodunuz');
    const [pending] = await admin<
      { password_hash: string; code_hash: Buffer; token_hash: Buffer }[]
    >`
      select password_hash, code_hash, token_hash from pending_registrations where email = ${email}`;
    expect(pending?.password_hash).toMatch(/^\$argon2id\$/);
    expect(pending?.code_hash.length).toBe(32);
    expect(pending?.code_hash.toString('utf8')).not.toContain(code);
    expect(pending?.token_hash.toString('base64url')).not.toBe(agent.registration);

    const verified = await verify(agent, code);
    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toEqual({ status: 'ok', failedAttemptsSinceLastLogin: 0 });
    expect(verified.cookies.find((c) => c.name === REGISTRATION_COOKIE_NAME)?.value).toBe('');
    expect(agent.registration).toBeUndefined();
    expect(agent.device).toBeDefined();

    const [row] = await admin<{ password_hash: string; email_verified_at: Date | null }[]>`
      select password_hash, email_verified_at from users where email = ${email}`;
    expect(row?.password_hash).toMatch(/^\$argon2id\$/);
    expect(row?.email_verified_at).not.toBeNull();
    expect(await admin`select id from pending_registrations where email = ${email}`).toHaveLength(
      0,
    );
    const me = await agent.request('GET', '/api/auth/me');
    expect(me.json()).toMatchObject({ email, mfaEnabled: false, locale: 'tr' });
  });

  it('kayıtta seçilen arayüz dilini saklar (FR-16)', async () => {
    const agent = new TestAgent(app);
    const email = uniqueEmail();
    const res = await agent.request('POST', '/api/auth/register', {
      email,
      password: PASSWORD,
      locale: 'en',
    });
    expect(res.statusCode).toBe(202);
    // Kod e-postası da seçilen dildedir.
    expect(outbox.at(-1)?.subject).toBe('Your JobTrack sign-up code');
    expect((await verify(agent, lastEmailCode(email))).statusCode).toBe(200);
    await agent.refreshCsrf();
    expect((await agent.request('GET', '/api/auth/me')).json()).toMatchObject({ locale: 'en' });
  });

  it("veritabanında oturum token'ının kendisini değil, hash'ini saklar", async () => {
    const agent = new TestAgent(app);
    await agent.register(uniqueEmail(), PASSWORD);
    const rows = await admin<{ token_hash: Buffer }[]>`select token_hash from sessions`;
    expect(rows.some((r) => r.token_hash.toString('base64url') === agent.token)).toBe(false);
    expect(rows.every((r) => r.token_hash.length === 32)).toBe(true);
  });

  it('sızmış parolayı reddeder', async () => {
    const res = await new TestAgent(app).request('POST', '/api/auth/register', {
      email: uniqueEmail(),
      password: BREACHED,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'password_breached' });
  });

  it('kayıtlı e-postayla kayıt aynı yanıtı alır; kod gitmez, hesap sahibi bilgilendirilir (A07)', async () => {
    const email = uniqueEmail();
    await new TestAgent(app).register(email, PASSWORD);
    const fresh = await startRegistration();

    const before = outbox.length;
    const { agent, res } = await startRegistration(email);
    expect(res.json()).toEqual(fresh.res.json());
    expect(res.cookies.map((c) => [c.name, c.httpOnly, c.secure, c.sameSite, c.maxAge])).toEqual(
      fresh.res.cookies.map((c) => [c.name, c.httpOnly, c.secure, c.sameSite, c.maxAge]),
    );
    // Adrese tek bir e-posta gider: kod değil, bilgilendirme.
    expect(outbox.slice(before)).toHaveLength(1);
    const notice = outbox.at(-1);
    expect(notice).toMatchObject({ to: email, subject: 'JobTrack: bu adresle yeni kayıt denendi' });
    expect(notice?.text).not.toMatch(/\b\d{6}\b/);

    // Hiçbir kod bu kaydı tamamlayamaz; hata, gerçek bir kayıttaki yanlış kodla aynıdır.
    const guess = await verify(agent, '123456');
    const wrong = await verify(fresh.agent, other(lastEmailCode(fresh.email)));
    expect(guess.statusCode).toBe(401);
    expect(guess.json<{ error: string; code: string }>()).toMatchObject({
      code: wrong.json<{ code: string }>().code,
      error: wrong.json<{ error: string }>().error,
    });
    // Yeniden gönderme de aynı davranır; yine yalnızca bilgilendirme gider.
    clockOffsetMs = 61 * 1000;
    const resent = await agent.request('POST', '/api/auth/register/resend');
    expect(resent.json()).toEqual({ expiresInSeconds: 120, resendInSeconds: 60 });
    expect(outbox.at(-1)?.text).not.toMatch(/\b\d{6}\b/);
    // Mevcut hesaba dokunulmaz.
    const [row] = await admin<
      { n: number }[]
    >`select count(*)::int as n from users where email = ${email}`;
    expect(row?.n).toBe(1);
    expect((await new TestAgent(app).login(email, PASSWORD)).statusCode).toBe(200);
  });

  it('kayıt kodu 2 dakika geçerlidir; çerezsiz doğrulama aynı hatayı alır', async () => {
    const { agent, email } = await startRegistration();
    const code = lastEmailCode(email);
    expect(
      (await new TestAgent(app).request('POST', '/api/auth/register/verify', { code })).json(),
    ).toMatchObject({
      code: 'invalid_email_code',
    });
    clockOffsetMs = 2 * 60 * 1000 + 1000;
    const res = await verify(agent, code);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'invalid_email_code' });
  });

  it('5 hatalı denemeden sonra doğru kod da geçmez; başka kaydın kodu geçmez', async () => {
    const a = await startRegistration();
    const codeA = lastEmailCode(a.email);
    const b = await startRegistration();
    const codeB = lastEmailCode(b.email);
    if (codeA !== codeB) expect((await verify(b.agent, codeA)).statusCode).toBe(401);
    for (let i = 0; i < 5; i++) await verify(a.agent, other(codeA));
    expect((await verify(a.agent, codeA)).statusCode).toBe(401);
    expect(await admin`select id from users where email = ${a.email}`).toHaveLength(0);
  });

  it('aynı kodla eşzamanlı iki doğrulamadan yalnızca biri hesap açar', async () => {
    const { agent, email } = await startRegistration();
    const twin = new TestAgent(app);
    twin.registration = agent.registration;
    const code = lastEmailCode(email);
    const results = await Promise.all([verify(agent, code), verify(twin, code)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    expect(await admin`select id from users where email = ${email}`).toHaveLength(1);
  });

  it('yeniden gönderme: 60 sn bekletir, yeni kod eskisini geçersiz kılar, adres başına saatte en fazla 5', async () => {
    const { agent, email } = await startRegistration();
    const first = lastEmailCode(email);
    expect((await agent.request('POST', '/api/auth/register/resend')).json()).toMatchObject({
      code: 'resend_too_soon',
    });
    clockOffsetMs = 61 * 1000;
    expect((await agent.request('POST', '/api/auth/register/resend')).statusCode).toBe(200);
    const second = lastEmailCode(email);
    if (second !== first) expect((await verify(agent, first)).statusCode).toBe(401);
    // Yeni bir kayıt isteği de aynı adresin sınırına sayılır: 2 + 3 = 5 e-posta.
    for (let i = 0; i < 3; i++) await startRegistration(email);
    const blocked = await new TestAgent(app).request('POST', '/api/auth/register', {
      email,
      password: PASSWORD,
    });
    expect(blocked.statusCode).toBe(429);
    clockOffsetMs += 61 * 1000;
    expect((await agent.request('POST', '/api/auth/register/resend')).statusCode).toBe(429);
  });

  it('süresi dolmuş kayıt yeniden kod alamaz ve silinir', async () => {
    const { agent, email } = await startRegistration();
    clockOffsetMs = 60 * 60 * 1000 + 1000;
    expect((await agent.request('POST', '/api/auth/register/resend')).json()).toMatchObject({
      code: 'registration_expired',
    });
    await startRegistration();
    expect(await admin`select id from pending_registrations where email = ${email}`).toHaveLength(
      0,
    );
  });

  it('uygulama rolü yalnızca çerezini taşıdığı bekleyen kaydı görür (RLS)', async () => {
    const { agent } = await startRegistration();
    const sql = postgres(testDb.appUrl, { max: 1 });
    try {
      expect(await sql`select id from pending_registrations`).toHaveLength(0);
      const own = createHash('sha256')
        .update(agent.registration ?? '')
        .digest('hex');
      const rows = await sql.begin(async (tx) => {
        await tx`select set_config('app.registration_token', ${own}, true)`;
        return tx`select id from pending_registrations`;
      });
      expect(rows).toHaveLength(1);
    } finally {
      await sql.end();
    }
  });

  it('tanımsız alanları reddeder (mass assignment)', async () => {
    const res = await new TestAgent(app).request('POST', '/api/auth/register', {
      email: uniqueEmail(),
      password: PASSWORD,
      totpEnabledAt: '2026-01-01',
    });
    expect(res.statusCode).toBe(400);
  });

  it('REGISTRATION_ENABLED=false iken uç nokta 404 döner', async () => {
    const closed = build({ REGISTRATION_ENABLED: 'false' });
    try {
      const res = await new TestAgent(closed).request('POST', '/api/auth/register', {
        email: uniqueEmail(),
        password: PASSWORD,
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await closed.close();
    }
  });
});

describe('giriş (FR-01, A07)', () => {
  it('yanlış parola ve olmayan hesap için aynı yanıtı verir', async () => {
    const email = uniqueEmail();
    await new TestAgent(app).register(email, PASSWORD);

    const wrong = await new TestAgent(app).request('POST', '/api/auth/login', {
      email,
      password: 'yanlis-parola-0000',
    });
    const missing = await new TestAgent(app).request('POST', '/api/auth/login', {
      email: uniqueEmail(),
      password: 'yanlis-parola-0000',
    });
    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.json<{ error: string }>().error).toBe(missing.json<{ error: string }>().error);
  });

  it("girişte oturum ID'sini yeniler ve önceki başarısız denemeleri bildirir", async () => {
    const email = uniqueEmail();
    const agent = new TestAgent(app);
    await agent.register(email, PASSWORD);
    const firstToken = agent.token;

    await new TestAgent(app).request('POST', '/api/auth/login', {
      email,
      password: 'yanlis-1-yanlis',
    });
    await new TestAgent(app).request('POST', '/api/auth/login', {
      email,
      password: 'yanlis-2-yanlis',
    });

    const res = await agent.login(email, PASSWORD);
    expect(res.json()).toEqual({ status: 'ok', failedAttemptsSinceLastLogin: 2 });
    expect(agent.token).toBeDefined();
    expect(agent.token).not.toBe(firstToken);
  });

  it('aynı hesaba 5 hatalı denemeden sonra doğru parolayı da geçici olarak reddeder', async () => {
    const email = uniqueEmail();
    await new TestAgent(app).register(email, PASSWORD);
    for (let i = 0; i < 5; i++) {
      await new TestAgent(app).request('POST', '/api/auth/login', {
        email,
        password: 'yanlis-parola-x',
      });
    }
    const res = await new TestAgent(app).request('POST', '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(429);
  });

  it('giriş kilidi yeniden başlatmada düşmez (denetim kaydından sayılır)', async () => {
    const email = uniqueEmail();
    await new TestAgent(app).register(email, PASSWORD);
    for (let i = 0; i < 5; i++) {
      await new TestAgent(app).request('POST', '/api/auth/login', {
        email,
        password: 'yanlis-parola-x',
      });
    }
    // Yeni süreç: bellekteki sayaç boş.
    const restarted = build();
    try {
      const res = await new TestAgent(restarted).request('POST', '/api/auth/login', {
        email,
        password: PASSWORD,
      });
      expect(res.statusCode).toBe(429);
      // Kilit 15 dakika sonra kalkar.
      clockOffsetMs = 15 * 60 * 1000 + 1000;
      const later = await new TestAgent(restarted).request('POST', '/api/auth/login', {
        email,
        password: PASSWORD,
      });
      expect(later.json()).toMatchObject({ status: 'email_required' });
    } finally {
      await restarted.close();
    }
  });

  it('başkasının hatalı denemeleri, sahibini güvenilen cihazından kilitleyemez (FR-19)', async () => {
    const email = uniqueEmail();
    const owner = new TestAgent(app);
    await owner.register(email, PASSWORD);
    await owner.request('POST', '/api/auth/logout');
    for (let i = 0; i < 6; i++) {
      await new TestAgent(app).request('POST', '/api/auth/login', {
        email,
        password: 'yanlis-parola-x',
      });
    }
    const stranger = await new TestAgent(app).request('POST', '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    expect(stranger.statusCode).toBe(429);
    // Başka hesabın cihaz çerezi kilidi aşmaz.
    const other = new TestAgent(app);
    await other.register(uniqueEmail(), PASSWORD);
    const borrowed = new TestAgent(app);
    borrowed.device = other.device;
    const res = await borrowed.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect(res.statusCode).toBe(429);
    const own = await owner.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect(own.json()).toMatchObject({ status: 'ok' });
  });

  it('başarısız girişleri denetim kaydına IP adresini açık yazmadan kaydeder', async () => {
    const email = uniqueEmail();
    await new TestAgent(app).register(email, PASSWORD);
    await new TestAgent(app).request('POST', '/api/auth/login', {
      email,
      password: 'yanlis-parola-y',
    });
    const rows = await admin<{ event: string; ip_hash: Buffer }[]>`
      select a.event, a.ip_hash from audit_log a join users u on u.id = a.user_id
      where u.email = ${email} order by a.created_at`;
    expect(rows.map((r) => r.event)).toEqual([
      'register',
      'email_verified',
      'login_success',
      'login_failed',
    ]);
    expect(rows[3]?.ip_hash.length).toBe(32);
  });
});

describe('istek doğrulama: Origin ve CSRF (A08)', () => {
  it('başka bir kökenden gelen girişi reddeder', async () => {
    const res = await new TestAgent(app).request(
      'POST',
      '/api/auth/login',
      { email: uniqueEmail(), password: PASSWORD },
      { origin: 'https://kotu-site.example' },
    );
    expect(res.statusCode).toBe(403);
  });

  it('Origin ve Sec-Fetch-Site başlığı olmayan durum değiştiren isteği reddeder', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: uniqueEmail(), password: PASSWORD },
    });
    expect(res.statusCode).toBe(403);
  });

  it("CSRF token'ı olmadan veya yanlış token ile çıkışı reddeder", async () => {
    const agent = new TestAgent(app);
    await agent.register(uniqueEmail(), PASSWORD);
    const csrf = agent.csrf;

    agent.csrf = undefined;
    expect((await agent.request('POST', '/api/auth/logout')).statusCode).toBe(403);
    agent.csrf = 'yanlis-token';
    expect((await agent.request('POST', '/api/auth/logout')).statusCode).toBe(403);

    agent.csrf = csrf;
    expect((await agent.request('POST', '/api/auth/logout')).statusCode).toBe(204);
    expect(agent.token).toBeUndefined();
  });

  it("bir oturumun CSRF token'ı başka bir oturumda geçmez", async () => {
    const a = new TestAgent(app);
    const b = new TestAgent(app);
    await a.register(uniqueEmail(), PASSWORD);
    await b.register(uniqueEmail(), PASSWORD);
    b.csrf = a.csrf;
    expect((await b.request('POST', '/api/auth/logout')).statusCode).toBe(403);
  });
});

describe('oturum yönetimi (FR-03, A07)', () => {
  it('geçersiz oturum çerezini Secure bayrağıyla siler (__Host- kuralı)', async () => {
    const agent = new TestAgent(app);
    agent.token = 'gecersiz-token';
    const res = await agent.request('GET', '/api/auth/me');
    expect(res.statusCode).toBe(401);
    const cleared = res.cookies.find((c) => c.name === COOKIE_NAME);
    expect(cleared).toMatchObject({ value: '', secure: true, path: '/' });
    expect(cleared?.expires?.getTime()).toBeLessThan(Date.now());
  });

  it('oturumsuz istek 401 alır', async () => {
    expect((await new TestAgent(app).request('GET', '/api/auth/me')).statusCode).toBe(401);
  });

  it('aktif oturumları listeler; yalnızca kullanıcının kendi oturumları görünür', async () => {
    const email = uniqueEmail();
    const first = new TestAgent(app);
    const second = new TestAgent(app);
    await first.register(email, PASSWORD);
    await second.login(email, PASSWORD);
    await new TestAgent(app).register(uniqueEmail(), PASSWORD);

    const res = await second.request('GET', '/api/auth/sessions');
    const sessions = res.json<{ sessions: { current: boolean }[] }>().sessions;
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toHaveLength(1);
  });

  it('tüm oturumları kapatınca diğer cihazlar da çıkış yapar', async () => {
    const email = uniqueEmail();
    const laptop = new TestAgent(app);
    const phone = new TestAgent(app);
    await laptop.register(email, PASSWORD);
    await phone.login(email, PASSWORD);

    expect((await laptop.request('DELETE', '/api/auth/sessions')).statusCode).toBe(204);
    expect((await phone.request('GET', '/api/auth/me')).statusCode).toBe(401);
    expect((await laptop.request('GET', '/api/auth/me')).statusCode).toBe(401);
  });

  it('30 dakika hareketsizlikten sonra oturum biter', async () => {
    const agent = new TestAgent(app);
    await agent.register(uniqueEmail(), PASSWORD);
    clockOffsetMs = 29 * 60 * 1000;
    expect((await agent.request('GET', '/api/auth/me')).statusCode).toBe(200);
    clockOffsetMs += 31 * 60 * 1000;
    expect((await agent.request('GET', '/api/auth/me')).statusCode).toBe(401);
  });

  it('etkin kullanılsa bile 7 gün sonunda oturum biter', async () => {
    const agent = new TestAgent(app);
    await agent.register(uniqueEmail(), PASSWORD);
    clockOffsetMs = 7 * 24 * 60 * 60 * 1000 + 1000;
    // Son etkinlik "şimdi" olsa bile mutlak süre dolmuştur.
    await admin`update sessions set last_seen_at = ${now()}`;
    expect((await agent.request('GET', '/api/auth/me')).statusCode).toBe(401);
  });
});

describe('e-posta doğrulama kodu (FR-18, FR-19, ADR-0007)', () => {
  /** Kayıtlı hesaba yeni bir cihazdan giriş: e-posta kodu istenir (yarım oturum). */
  const startRegistration = async () => {
    const email = uniqueEmail();
    await new TestAgent(app).register(email, PASSWORD);
    const agent = new TestAgent(app);
    const res = await agent.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect(res.json()).toMatchObject({ status: 'email_required' });
    return { agent, email, code: lastEmailCode(email) };
  };
  const verify = (agent: TestAgent, code: string) =>
    agent.request('POST', '/api/auth/email/verify', { code });
  const other = (code: string) => (code === '000000' ? '111111' : '000000');

  it('kod düz metin saklanmaz, loglanmaz; yarım oturum veriye erişemez', async () => {
    const { agent, email, code } = await startRegistration();
    const rows = await admin<{ code_hash: Buffer }[]>`
      select c.code_hash from email_codes c join users u on u.id = c.user_id
      where u.email = ${email} and c.consumed_at is null`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code_hash.length).toBe(32);
    expect(rows[0]?.code_hash.toString('utf8')).not.toContain(code);
    // Yarım oturum korumalı uçlara giremez.
    expect((await agent.request('GET', '/api/applications')).statusCode).toBe(401);
    expect((await agent.request('GET', '/api/auth/me')).statusCode).toBe(401);
  });

  it('kod 2 dakika sonra geçersizdir', async () => {
    const { agent, code } = await startRegistration();
    clockOffsetMs = 2 * 60 * 1000 + 1000;
    const res = await verify(agent, code);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'invalid_email_code' });
  });

  it('kod tek kullanımlıktır; 5 hatalı denemeden sonra doğru kod da geçmez', async () => {
    const { agent, code } = await startRegistration();
    for (let i = 0; i < 5; i++) {
      expect((await verify(agent, other(code))).json()).toMatchObject({
        code: 'invalid_email_code',
      });
    }
    // Kullanıcı sayacı da dolduğu için artık hız sınırına takılır.
    expect((await verify(agent, code)).statusCode).toBe(429);
  });

  it('yeniden gönderme: 60 sn bekletir, yeni kod eskisini geçersiz kılar, saatte en fazla 5', async () => {
    const { agent, email, code: first } = await startRegistration();
    expect((await agent.request('POST', '/api/auth/email/resend')).json()).toMatchObject({
      code: 'resend_too_soon',
    });
    clockOffsetMs = 61 * 1000;
    const resent = await agent.request('POST', '/api/auth/email/resend');
    expect(resent.json()).toEqual({ expiresInSeconds: 120, resendInSeconds: 60 });
    const second = lastEmailCode(email);
    if (second !== first) {
      expect((await verify(agent, first)).statusCode).toBe(401);
    }
    // Üç kod daha (toplam 5); altıncısı saatlik sınıra takılır. Yarım oturum 5 dk sürdüğü için
    // her adımda süre uzatılır.
    for (let i = 0; i < 3; i++) {
      clockOffsetMs += 61 * 1000;
      await admin`update sessions set last_seen_at = ${now()}, expires_at = ${new Date(now().getTime() + 300_000)}`;
      expect((await agent.request('POST', '/api/auth/email/resend')).statusCode).toBe(200);
    }
    clockOffsetMs += 61 * 1000;
    await admin`update sessions set last_seen_at = ${now()}, expires_at = ${new Date(now().getTime() + 300_000)}`;
    expect((await agent.request('POST', '/api/auth/email/resend')).statusCode).toBe(429);
  });

  it('başka kullanıcının kodu işe yaramaz', async () => {
    const a = await startRegistration();
    const b = await startRegistration();
    if (a.code !== b.code) {
      expect((await verify(b.agent, a.code)).statusCode).toBe(401);
    }
    expect((await verify(b.agent, b.code)).statusCode).toBe(200);
  });

  it('doğrulanan cihaz hatırlanır; "tüm oturumları kapat" cihazları da unutur', async () => {
    const email = uniqueEmail();
    const agent = new TestAgent(app);
    await agent.register(email, PASSWORD);
    expect(agent.device).toBeDefined();
    const cookie = (await agent.request('POST', '/api/auth/logout')).cookies;
    expect(cookie.find((c) => c.name === COOKIE_NAME)?.value).toBe('');

    // Aynı cihaz: kod istenmez.
    const again = await agent.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect(again.json()).toMatchObject({ status: 'ok' });
    // Yeni cihaz: kod istenir.
    const fresh = await new TestAgent(app).request('POST', '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    expect(fresh.json()).toMatchObject({ status: 'email_required' });

    await agent.refreshCsrf();
    expect((await agent.request('DELETE', '/api/auth/sessions')).statusCode).toBe(204);
    const afterRevoke = await agent.request('POST', '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    expect(afterRevoke.json()).toMatchObject({ status: 'email_required' });
  });

  it('cihaz çerezi güvenli ayarlarla gelir ve başka hesapta geçmez', async () => {
    const { agent, code } = await startRegistration();
    const verified = await verify(agent, code);
    const device = verified.cookies.find((c) => c.name === DEVICE_COOKIE_NAME);
    expect(device).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });

    // B hesabı, A'nın cihaz çereziyle kodsuz giriş yapamaz.
    const otherEmail = uniqueEmail();
    await new TestAgent(app).register(otherEmail, PASSWORD);
    const thief = new TestAgent(app);
    thief.device = agent.device;
    const login = await thief.request('POST', '/api/auth/login', {
      email: otherEmail,
      password: PASSWORD,
    });
    expect(login.json()).toMatchObject({ status: 'email_required' });
  });

  it('TOTP açık hesapta e-posta kodu TOTP yerine geçmez', async () => {
    const email = uniqueEmail();
    const agent = new TestAgent(app);
    await agent.register(email, PASSWORD);
    await enableMfa(agent);
    await agent.request('POST', '/api/auth/logout');

    const fresh = new TestAgent(app);
    const login = await fresh.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect(login.json()).toEqual({ status: 'mfa_required' });
    const bypass = await verify(fresh, '123456');
    expect(bypass.json()).toMatchObject({ code: 'totp_required' });
    expect((await fresh.request('POST', '/api/auth/email/resend')).json()).toMatchObject({
      code: 'totp_required',
    });
  });

  it('doğrulanmamış (eski) hesap girişte kod alır ve doğrulanınca işaretlenir', async () => {
    // Önce-e-posta kaydından önce açılmış hesaplar doğrulanmamış olabilir.
    const email = uniqueEmail();
    await new TestAgent(app).register(email, PASSWORD);
    await admin`update users set email_verified_at = null where email = ${email}`;
    clockOffsetMs = 3 * 60 * 1000;
    const agent = new TestAgent(app);
    const login = await agent.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect(login.json()).toMatchObject({ status: 'email_required' });
    expect((await verify(agent, lastEmailCode(email))).statusCode).toBe(200);
    const [row] = await admin<{ email_verified_at: Date | null }[]>`
      select email_verified_at from users where email = ${email}`;
    expect(row?.email_verified_at).not.toBeNull();
  });
});

describe('iki adımlı doğrulama (FR-02)', () => {
  it('kurulum, girişte ikinci adım ve kurtarma kodu akışı', async () => {
    const email = uniqueEmail();
    const agent = new TestAgent(app);
    await agent.register(email, PASSWORD);
    const { secret, recoveryCodes } = await enableMfa(agent);
    expect(recoveryCodes).toHaveLength(10);
    expect(new Set(recoveryCodes).size).toBe(10);

    // Gizli anahtar veritabanında şifreli durur.
    const [row] = await admin<{ totp_secret_enc: string }[]>`
      select totp_secret_enc from users where email = ${email}`;
    expect(row?.totp_secret_enc.startsWith('v1.')).toBe(true);
    expect(row?.totp_secret_enc).not.toContain(secret);

    // Parola doğru → yalnızca yarım oturum; korumalı uçlar kapalı.
    const device = new TestAgent(app);
    const login = await device.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect(login.json()).toEqual({ status: 'mfa_required' });
    const pendingToken = device.token;
    expect((await device.request('GET', '/api/auth/me')).statusCode).toBe(401);

    // Yanlış kod reddedilir, doğru kod tam oturum açar ve token yenilenir.
    expect(
      (await device.request('POST', '/api/auth/mfa/verify', { code: '000000' })).statusCode,
    ).toBe(401);
    const code = generateTotp(secret, now().getTime());
    const verified = await device.request('POST', '/api/auth/mfa/verify', { code });
    expect(verified.statusCode).toBe(200);
    expect(device.token).not.toBe(pendingToken);
    expect((await device.request('GET', '/api/auth/me')).statusCode).toBe(200);

    // Aynı kod ikinci kez kullanılamaz (replay).
    const replay = new TestAgent(app);
    await replay.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect((await replay.request('POST', '/api/auth/mfa/verify', { code })).statusCode).toBe(401);

    // Kurtarma kodu bir kez çalışır.
    const recovery = recoveryCodes[0] ?? '';
    const r1 = new TestAgent(app);
    await r1.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect(
      (await r1.request('POST', '/api/auth/mfa/verify', { recoveryCode: recovery.toUpperCase() }))
        .statusCode,
    ).toBe(200);
    const r2 = new TestAgent(app);
    await r2.request('POST', '/api/auth/login', { email, password: PASSWORD });
    expect(
      (await r2.request('POST', '/api/auth/mfa/verify', { recoveryCode: recovery })).statusCode,
    ).toBe(401);
  });

  it('5 hatalı koddan sonra MFA geçici olarak kilitlenir; yeni yarım oturum sayacı sıfırlamaz', async () => {
    const email = uniqueEmail();
    const agent = new TestAgent(app);
    await agent.register(email, PASSWORD);
    const { secret } = await enableMfa(agent);

    // Saldırgan önceden birçok yarım oturum alıp deneme hakkını yenilemeye çalışır.
    const devices = Array.from({ length: 6 }, () => new TestAgent(app));
    for (const device of devices) {
      await device.request('POST', '/api/auth/login', { email, password: PASSWORD });
    }
    for (const device of devices.slice(0, 5)) {
      await device.request('POST', '/api/auth/mfa/verify', { code: '000000' });
    }
    const device = devices[5] as TestAgent;
    const res = await device.request('POST', '/api/auth/mfa/verify', {
      code: generateTotp(secret, now().getTime()),
    });
    expect(res.statusCode).toBe(429);
    // Engelde yarım oturum da silinir.
    const after = await device.request('POST', '/api/auth/mfa/verify', {
      code: generateTotp(secret, now().getTime()),
    });
    expect(after.statusCode).toBe(401);
    // Hatalı kodlar denetim kaydında sayıldığı için yeni yarım oturum da alınamaz.
    const fresh = await new TestAgent(app).request('POST', '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    expect(fresh.statusCode).toBe(429);
  });

  it('aynı kodla eşzamanlı iki doğrulamadan yalnızca biri başarılı olur (atomik replay koruması)', async () => {
    const email = uniqueEmail();
    const agent = new TestAgent(app);
    await agent.register(email, PASSWORD);
    const { secret } = await enableMfa(agent);

    const first = new TestAgent(app);
    const second = new TestAgent(app);
    await first.request('POST', '/api/auth/login', { email, password: PASSWORD });
    await second.request('POST', '/api/auth/login', { email, password: PASSWORD });
    const code = generateTotp(secret, now().getTime());
    const results = await Promise.all([
      first.request('POST', '/api/auth/mfa/verify', { code }),
      second.request('POST', '/api/auth/mfa/verify', { code }),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
  });

  it('TOTP adımı veritabanında atomik işaretlenir: çakışan ikinci transaction false alır', async () => {
    const email = uniqueEmail();
    await new TestAgent(app).register(email, PASSWORD);
    const [user] = await admin<{ id: string }[]>`select id from users where email = ${email}`;
    const userId = user?.id ?? '';
    const step = 1_000_000;

    // 1. transaction adımı işaretler ama commit etmeden bekler; 2. transaction aynı adımı dener.
    let claimed!: () => void;
    const firstClaimed = new Promise<void>((resolve) => (claimed = resolve));
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const first = withUserTx(database.db, userId, async (tx) => {
      const ok = await claimTotpStep(tx, userId, step);
      claimed();
      await hold;
      return ok;
    });
    await firstClaimed;
    const second = withUserTx(database.db, userId, (tx) => claimTotpStep(tx, userId, step));
    // İkinci transaction satır kilidinde bekler; birincisi commit edince koşulu yeniden değerlendirir.
    await new Promise((resolve) => setTimeout(resolve, 100));
    release();
    expect([await first, await second]).toEqual([true, false]);
    // Daha eski bir adım da reddedilir.
    expect(await withUserTx(database.db, userId, (tx) => claimTotpStep(tx, userId, step - 1))).toBe(
      false,
    );
  });

  it('MFA etkinleştirme mevcut parolayı ister', async () => {
    const agent = new TestAgent(app);
    await agent.register(uniqueEmail(), PASSWORD);
    const setup = await agent.request('POST', '/api/auth/mfa/setup');
    const secret =
      new URL(setup.json<{ otpauthUri: string }>().otpauthUri).searchParams.get('secret') ?? '';
    const code = generateTotp(secret, now().getTime());

    const missing = await agent.request('POST', '/api/auth/mfa/enable', { code });
    expect(missing.statusCode).toBe(400);
    const wrong = await agent.request('POST', '/api/auth/mfa/enable', {
      code,
      password: 'yanlis-parola-0000',
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({ code: 'invalid_password' });
    expect((await agent.request('GET', '/api/auth/me')).json()).toMatchObject({
      mfaEnabled: false,
    });

    const ok = await agent.request('POST', '/api/auth/mfa/enable', { code, password: PASSWORD });
    expect(ok.statusCode).toBe(200);
  });

  it('yarım oturum 5 dakika sonra geçersiz olur', async () => {
    const email = uniqueEmail();
    const agent = new TestAgent(app);
    await agent.register(email, PASSWORD);
    const { secret } = await enableMfa(agent);

    const device = new TestAgent(app);
    await device.request('POST', '/api/auth/login', { email, password: PASSWORD });
    clockOffsetMs = 6 * 60 * 1000;
    const res = await device.request('POST', '/api/auth/mfa/verify', {
      code: generateTotp(secret, now().getTime()),
    });
    expect(res.statusCode).toBe(401);
  });

  it('tam oturum ikinci adım ucunu kullanamaz', async () => {
    const agent = new TestAgent(app);
    await agent.register(uniqueEmail(), PASSWORD);
    const res = await agent.request('POST', '/api/auth/mfa/verify', { code: '123456' });
    expect(res.statusCode).toBe(401);
  });

  it('MFA zaten açıkken kurulum yeniden başlatılamaz', async () => {
    const agent = new TestAgent(app);
    await agent.register(uniqueEmail(), PASSWORD);
    await enableMfa(agent);
    expect((await agent.request('POST', '/api/auth/mfa/setup')).statusCode).toBe(409);
  });
});

describe('IP bazlı hız sınırı (A07)', () => {
  it("aynı IP'den 15 dakikada 10'dan fazla giriş denemesini reddeder", async () => {
    const limited = build({}, true);
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++) {
        const res = await new TestAgent(limited).request('POST', '/api/auth/login', {
          email: uniqueEmail(),
          password: 'yanlis-parola-z',
        });
        statuses.push(res.statusCode);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
