import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ApplicationDetail, Stats } from '@jobtrack/shared';
import { buildApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/client.js';
import { generateTotp } from '../../lib/totp.js';
import {
  COOKIE_NAME,
  startTestDatabase,
  TestAgent,
  testConfig,
  type TestDatabase,
  testMailer,
  lastEmailCode,
  outbox,
} from '../../test/helpers.js';

const PASSWORD = 'cok-guvenli-parola-2026';

let testDb: TestDatabase;
let database: Database;
let admin: postgres.Sql;
let app: FastifyInstance;
let counter = 0;
const logs: string[] = [];

beforeAll(async () => {
  testDb = await startTestDatabase();
  database = createDatabase(testDb.appUrl);
  admin = postgres(testDb.adminUrl, { max: 1, onnotice: () => undefined });
  app = buildApp(testConfig({ LOG_LEVEL: 'info' }), {
    db: database.db,
    mailer: testMailer,
    isPwned: null,
    rateLimit: false,
    logStream: { write: (line) => logs.push(line) },
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await database.close();
  await admin.end();
  await testDb.stop();
});

async function newUser(): Promise<{ agent: TestAgent; email: string }> {
  const agent = new TestAgent(app);
  const email = `hesap${String(++counter)}@example.com`;
  await agent.register(email, PASSWORD);
  return { agent, email };
}

async function create(agent: TestAgent, body: Record<string, unknown>): Promise<ApplicationDetail> {
  const res = await agent.request('POST', '/api/applications', body);
  expect(res.statusCode).toBe(201);
  return res.json<ApplicationDetail>();
}

const stage = (agent: TestAgent, id: string, value: string) =>
  agent.request('POST', `/api/applications/${id}/stage`, { stage: value });

describe('pano istatistikleri (FR-12)', () => {
  it('aşama dağılımını, dönüş ve mülakat oranlarını, CV ve kaynak kırılımını hesaplar', async () => {
    const { agent } = await newUser();
    const cvRes = await agent.request('POST', '/api/cv-versions', { label: 'Data AI' });
    const cvId = cvRes.json<{ id: string }>().id;

    // 4 başvuru gönderildi + 1 yalnızca kaydedildi.
    const a = await create(agent, {
      companyName: 'A',
      positionTitle: '1',
      appliedAt: '2026-10-01',
      cvVersionId: cvId,
      source: 'linkedin',
    });
    const b = await create(agent, {
      companyName: 'B',
      positionTitle: '2',
      appliedAt: '2026-10-02',
      cvVersionId: cvId,
      source: 'linkedin',
    });
    const c = await create(agent, {
      companyName: 'C',
      positionTitle: '3',
      appliedAt: '2026-10-03',
      source: 'referral',
    });
    await create(agent, { companyName: 'D', positionTitle: '4', appliedAt: '2026-10-04' });
    await create(agent, { companyName: 'E', positionTitle: 'taslak' });

    // a: mülakat → red (dönüş + mülakat). b: teklif. c: doğrudan red (dönüş, mülakat yok). d: ses yok.
    await stage(agent, a.id, 'technical');
    await stage(agent, a.id, 'rejected');
    await stage(agent, b.id, 'screening');
    await stage(agent, b.id, 'offer');
    await stage(agent, c.id, 'rejected');

    const res = await agent.request('GET', '/api/stats');
    expect(res.statusCode).toBe(200);
    const stats = res.json<Stats>();

    expect(stats.overall).toEqual({ applied: 4, responded: 3, interviewed: 2, offered: 1 });
    expect(stats.byStage.find((s) => s.stage === 'rejected')?.count).toBe(2);
    expect(stats.byStage.find((s) => s.stage === 'saved')?.count).toBe(1);
    expect(stats.byStage).toHaveLength(11);

    expect(stats.byCvVersion).toContainEqual({
      cvVersionId: cvId,
      label: 'Data AI',
      applied: 2,
      responded: 2,
      interviewed: 2,
      offered: 1,
    });
    expect(stats.byCvVersion).toContainEqual({
      cvVersionId: null,
      label: null,
      applied: 2,
      responded: 1,
      interviewed: 0,
      offered: 0,
    });
    expect(stats.bySource.find((s) => s.source === 'linkedin')).toMatchObject({
      applied: 2,
      offered: 1,
    });

    expect(stats.weekly).toHaveLength(12);
    expect(stats.weekly.reduce((sum, w) => sum + w.count, 0)).toBeGreaterThanOrEqual(0);
  });

  it('boş hesapta sıfır döner ve başka kullanıcının verisini saymaz', async () => {
    const { agent: other } = await newUser();
    await create(other, { companyName: 'X', positionTitle: 'Y', appliedAt: '2026-10-01' });
    const { agent } = await newUser();
    const stats = (await agent.request('GET', '/api/stats')).json<Stats>();
    expect(stats.overall).toEqual({ applied: 0, responded: 0, interviewed: 0, offered: 0 });
    expect(stats.byCvVersion).toEqual([]);
    expect(stats.followUpCount).toBe(0);
    expect(stats.nextInterview).toBeNull();
  });

  it('sıradaki mülakatı verir; geçmiş, arşivdeki ve başka kullanıcınınkini saymaz', async () => {
    const day = 24 * 3600 * 1000;
    const { agent: other } = await newUser();
    const foreign = await create(other, { companyName: 'Yabancı', positionTitle: 'Z' });
    await other.request('POST', `/api/applications/${foreign.id}/activities`, {
      type: 'interview',
      occurredAt: new Date(Date.now() + day).toISOString(),
    });

    const { agent } = await newUser();
    const later = await create(agent, { companyName: 'Sonra AŞ', positionTitle: 'Analist' });
    const sooner = await create(agent, { companyName: 'Önce AŞ', positionTitle: 'Mühendis' });
    const archived = await create(agent, { companyName: 'Arşiv AŞ', positionTitle: 'X' });
    const at = (offset: number) => new Date(Date.now() + offset).toISOString();
    const add = (id: string, type: string, occurredAt: string) =>
      agent.request('POST', `/api/applications/${id}/activities`, { type, occurredAt });
    await add(later.id, 'interview', at(5 * day));
    await add(sooner.id, 'interview', at(3 * day));
    await add(sooner.id, 'interview', at(-day));
    await add(sooner.id, 'call', at(day));
    await add(archived.id, 'interview', at(2 * day));
    await agent.request('POST', `/api/applications/${archived.id}/archive`);

    const stats = (await agent.request('GET', '/api/stats')).json<Stats>();
    expect(stats.nextInterview).toMatchObject({
      applicationId: sooner.id,
      companyName: 'Önce AŞ',
      positionTitle: 'Mühendis',
    });
  });
});

describe('veri dışa aktarma (FR-14)', () => {
  it('JSON: tüm veriyi içerir, gizli alanları içermez, denetim kaydı yazar', async () => {
    const { agent, email } = await newUser();
    const app1 = await create(agent, {
      companyName: 'Acme',
      positionTitle: 'Analist',
      salaryExpectation: '90 bin',
      notes: 'özel not',
    });
    await agent.request('POST', `/api/applications/${app1.id}/activities`, {
      type: 'call',
      occurredAt: '2026-10-05T10:00:00Z',
      contactName: 'Ayşe',
    });

    const res = await agent.request('GET', '/api/account/export?format=json');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="jobtrack-.*\.json"$/,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    const data = res.json<{
      account: { email: string };
      applications: { notes: string; stageHistory: unknown[]; activities: unknown[] }[];
      companies: unknown[];
    }>();
    expect(data.account.email).toBe(email);
    expect(data.companies).toHaveLength(1);
    expect(data.applications[0]).toMatchObject({ notes: 'özel not', salaryExpectation: '90 bin' });
    expect(data.applications[0]?.stageHistory).toHaveLength(1);
    expect(data.applications[0]?.activities).toHaveLength(1);
    for (const secret of ['argon2', 'password', 'totp', 'token', 'v1.']) {
      expect(res.body).not.toContain(secret);
    }

    const [audit] = await admin<{ n: number }[]>`
      select count(*)::int as n from audit_log a join users u on u.id = a.user_id
      where u.email = ${email} and a.event = 'data_export'`;
    expect(audit?.n).toBe(1);
  });

  it('CSV: Türkçe başlık, BOM ve formül enjeksiyonuna karşı kaçışlanmış hücreler', async () => {
    const { agent } = await newUser();
    await create(agent, { companyName: '=HYPERLINK("http://kotu")', positionTitle: '+90 Analist' });
    const res = await agent.request('GET', '/api/account/export?format=csv');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body.startsWith('﻿"Şirket","Pozisyon","Aşama"')).toBe(true);
    expect(res.body).toContain(`"'=HYPERLINK(""http://kotu"")","'+90 Analist","Kaydedildi"`);
  });

  it('CSV ve takvim kullanıcının arayüz dilindedir (FR-16)', async () => {
    const { agent } = await newUser();
    await agent.request('PATCH', '/api/settings', { locale: 'en' });
    const a = await create(agent, { companyName: 'Acme', positionTitle: 'Analyst' });
    await agent.request('POST', `/api/applications/${a.id}/activities`, {
      type: 'interview',
      occurredAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      contactName: 'Jane',
    });

    const csv = await agent.request('GET', '/api/account/export?format=csv');
    expect(csv.body.startsWith('\uFEFF"Company","Position","Stage"')).toBe(true);
    expect(csv.body).toContain('"Acme","Analyst","Saved"');
    const ics = await agent.request('GET', '/api/account/calendar.ics');
    expect(ics.body).toContain('SUMMARY:Interview: Acme – Analyst');
    expect(ics.body).toContain('Contact: Jane');
  });

  it('bilinmeyen biçimi reddeder; oturumsuz erişim 401', async () => {
    const { agent } = await newUser();
    expect((await agent.request('GET', '/api/account/export?format=xml')).statusCode).toBe(400);
    expect(
      (await new TestAgent(app).request('GET', '/api/account/export?format=json')).statusCode,
    ).toBe(401);
  });
});

describe('takvim (FR-17)', () => {
  it('yalnızca yaklaşan mülakatları içerir', async () => {
    const { agent } = await newUser();
    const a = await create(agent, { companyName: 'Takvim AŞ', positionTitle: 'Analist' });
    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
    await agent.request('POST', `/api/applications/${a.id}/activities`, {
      type: 'interview',
      occurredAt: future,
      contactName: 'Mehmet',
      notes: 'gizli not',
    });
    await agent.request('POST', `/api/applications/${a.id}/activities`, {
      type: 'interview',
      occurredAt: '2026-01-01T10:00:00Z',
    });
    await agent.request('POST', `/api/applications/${a.id}/activities`, {
      type: 'call',
      occurredAt: future,
    });

    const res = await agent.request('GET', '/api/account/calendar.ics');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.body.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(res.body).toContain('SUMMARY:Mülakat: Takvim AŞ – Analist');
    expect(res.body).toContain('Görüşülen kişi: Mehmet');
    expect(res.body).not.toContain('gizli not');
  });
});

/** FR-14, ADR-0007: silme onayı için e-postaya gelen kod. */
async function deletionCode(agent: TestAgent, email: string): Promise<string> {
  const res = await agent.request('POST', '/api/account/deletion-code');
  expect(res.statusCode).toBe(200);
  expect(outbox.at(-1)?.subject).toBe('JobTrack hesap silme onay kodu');
  return lastEmailCode(email);
}

describe('hesap silme (FR-14, KVKK)', () => {
  it('parola ve onay metni olmadan silmez; doğru bilgilerle her şeyi siler', async () => {
    const { agent, email } = await newUser();
    const a = await create(agent, {
      companyName: 'Silinecek',
      positionTitle: 'X',
      appliedAt: '2026-10-01',
    });
    await stage(agent, a.id, 'technical');
    await agent.request('POST', `/api/applications/${a.id}/activities`, {
      type: 'call',
      occurredAt: '2026-10-05T10:00:00Z',
    });
    await agent.request('POST', '/api/cv-versions', { label: 'CV' });
    const emailCode = await deletionCode(agent, email);

    expect((await agent.request('DELETE', '/api/account', { password: PASSWORD })).statusCode).toBe(
      400,
    );
    const wrong = await agent.request('DELETE', '/api/account', {
      password: 'yanlis-parola-0000',
      confirm: 'SİL',
      emailCode,
    });
    expect(wrong.json()).toMatchObject({ code: 'invalid_password' });

    const res = await agent.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode,
    });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === COOKIE_NAME)?.value).toBe('');

    const [counts] = await admin<Record<string, number>[]>`
      select
        (select count(*)::int from users where email = ${email}) as users,
        (select count(*)::int from companies where name = 'Silinecek') as companies,
        (select count(*)::int from applications where id = ${a.id}) as applications,
        (select count(*)::int from stage_history where application_id = ${a.id}) as history,
        (select count(*)::int from activities where application_id = ${a.id}) as activities`;
    expect(counts).toEqual({ users: 0, companies: 0, applications: 0, history: 0, activities: 0 });

    // Oturum da bitti; aynı e-postayla giriş yapılamaz.
    expect((await agent.request('GET', '/api/auth/me')).statusCode).toBe(401);
    const login = await new TestAgent(app).request('POST', '/api/auth/login', {
      email,
      password: PASSWORD,
    });
    expect(login.statusCode).toBe(401);

    // Log kimliksiz: e-posta ve kullanıcı ID'si yazılmaz.
    const line = logs.find((l) => l.includes('account_deleted')) ?? '';
    expect(line).not.toBe('');
    expect(line).not.toContain(email);
  });

  it('MFA açıksa doğrulama kodu da ister', async () => {
    const { agent, email } = await newUser();
    const emailCode = await deletionCode(agent, email);
    const setup = await agent.request('POST', '/api/auth/mfa/setup');
    const secret =
      new URL(setup.json<{ otpauthUri: string }>().otpauthUri).searchParams.get('secret') ?? '';
    await agent.request('POST', '/api/auth/mfa/enable', {
      code: generateTotp(secret, Date.now() - 30_000),
      password: PASSWORD,
    });

    const noCode = await agent.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode,
    });
    expect(noCode.json()).toMatchObject({ code: 'mfa_required' });
    const badCode = await agent.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode,
      code: '000000',
    });
    expect(badCode.json()).toMatchObject({ code: 'invalid_mfa_code' });

    const ok = await agent.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode,
      code: generateTotp(secret),
    });
    expect(ok.statusCode).toBe(204);
  });

  it('MFA kodu denemelerini kullanıcı bazında sınırlar (A07)', async () => {
    const { agent, email } = await newUser();
    const emailCode = await deletionCode(agent, email);
    const setup = await agent.request('POST', '/api/auth/mfa/setup');
    const secret =
      new URL(setup.json<{ otpauthUri: string }>().otpauthUri).searchParams.get('secret') ?? '';
    await agent.request('POST', '/api/auth/mfa/enable', {
      code: generateTotp(secret, Date.now() - 30_000),
      password: PASSWORD,
    });

    const wrong = generateTotp(secret, Date.now() + 10 * 60_000);
    for (let i = 0; i < 5; i++) {
      const res = await agent.request('DELETE', '/api/account', {
        password: PASSWORD,
        confirm: 'SİL',
        emailCode,
        code: wrong,
      });
      expect(res.json()).toMatchObject({ code: 'invalid_mfa_code' });
    }
    const blocked = await agent.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode,
      code: generateTotp(secret),
    });
    expect(blocked.statusCode).toBe(429);
    expect((await agent.request('GET', '/api/auth/me')).statusCode).toBe(200);
  });

  it('başka bir kullanıcının verisine dokunmaz', async () => {
    const { agent: keep, email: keepEmail } = await newUser();
    await create(keep, { companyName: 'Kalacak', positionTitle: 'X' });
    const { agent: leave, email: leaveEmail } = await newUser();
    await leave.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode: await deletionCode(leave, leaveEmail),
    });
    const [row] = await admin<{ n: number }[]>`
      select count(*)::int as n from applications a join users u on u.id = a.user_id
      where u.email = ${keepEmail}`;
    expect(row?.n).toBe(1);
  });

  it('e-posta kodu olmadan, yanlış ya da giriş koduyla silmez (ADR-0007)', async () => {
    const { agent, email } = await newUser();
    // Kod istenmeden: geçerli bir silme kodu yok.
    const none = await agent.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode: '123456',
    });
    expect(none.json()).toMatchObject({ code: 'invalid_email_code' });
    // Eksik alan şemadan geçmez.
    expect(
      (await agent.request('DELETE', '/api/account', { password: PASSWORD, confirm: 'SİL' }))
        .statusCode,
    ).toBe(400);

    const code = await deletionCode(agent, email);
    // Yeniden gönderme 60 sn dolmadan reddedilir.
    expect((await agent.request('POST', '/api/account/deletion-code')).json()).toMatchObject({
      code: 'resend_too_soon',
    });
    const wrong = code === '000000' ? '111111' : '000000';
    const bad = await agent.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode: wrong,
    });
    expect(bad.json()).toMatchObject({ code: 'invalid_email_code' });
    expect((await agent.request('GET', '/api/auth/me')).statusCode).toBe(200);

    const ok = await agent.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode: code,
    });
    expect(ok.statusCode).toBe(204);
  });
});

describe('web-vitals (NFR-03)', () => {
  it('oturumsuz kabul eder ve yalnızca metrik bilgisini loglar', async () => {
    const res = await new TestAgent(app).request('POST', '/api/vitals', {
      name: 'LCP',
      value: 1234.5,
      rating: 'good',
      route: '/basvurular/:id',
    });
    expect(res.statusCode).toBe(204);
    expect(logs.some((l) => l.includes('"name":"LCP"') && l.includes('/basvurular/:id'))).toBe(
      true,
    );
  });

  it('geçersiz metriği ve URL içeren rotayı reddeder', async () => {
    const agent = new TestAgent(app);
    expect(
      (
        await agent.request('POST', '/api/vitals', {
          name: 'XSS',
          value: 1,
          rating: 'good',
          route: '/',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await agent.request('POST', '/api/vitals', {
          name: 'LCP',
          value: 1,
          rating: 'good',
          route: '/basvurular/?email=berra@example.com',
        })
      ).statusCode,
    ).toBe(400);
  });
});
