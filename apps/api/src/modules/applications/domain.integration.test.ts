import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Activity, ApplicationDetail, Company, CvVersion } from '@jobtrack/shared';
import { buildApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/client.js';
import {
  startTestDatabase,
  TestAgent,
  testConfig,
  type TestDatabase,
  testMailer,
} from '../../test/helpers.js';
import { todayIn } from './applications.service.js';

const PASSWORD = 'cok-guvenli-parola-2026';

let testDb: TestDatabase;
let database: Database;
let admin: postgres.Sql;
let app: FastifyInstance;
let counter = 0;

beforeAll(async () => {
  testDb = await startTestDatabase();
  database = createDatabase(testDb.appUrl);
  admin = postgres(testDb.adminUrl, { max: 1, onnotice: () => undefined });
  app = buildApp(testConfig(), {
    db: database.db,
    mailer: testMailer,
    isPwned: null,
    rateLimit: false,
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await database.close();
  await admin.end();
  await testDb.stop();
});

async function newUser(): Promise<TestAgent> {
  const agent = new TestAgent(app);
  await agent.register(`alan${String(++counter)}@example.com`, PASSWORD);
  return agent;
}

async function json<T>(
  agent: TestAgent,
  method: 'GET' | 'POST' | 'DELETE' | 'PATCH',
  url: string,
  body?: unknown,
  expectedStatus = method === 'POST' ? 201 : 200,
): Promise<T> {
  const res = await agent.request(method, url, body);
  if (res.statusCode !== expectedStatus) {
    throw new Error(`${method} ${url} → ${String(res.statusCode)}: ${res.body}`);
  }
  return res.json<T>();
}

const createApplication = (agent: TestAgent, body: Record<string, unknown>) =>
  json<ApplicationDetail>(agent, 'POST', '/api/applications', body);

describe('şirketler (FR-13)', () => {
  it('oluşturur, listeler, günceller ve siler', async () => {
    const user = await newUser();
    const company = await json<Company>(user, 'POST', '/api/companies', {
      name: '  Acme Teknoloji ',
      sector: 'Yazılım',
      website: 'https://acme.example',
    });
    expect(company).toMatchObject({
      name: 'Acme Teknoloji',
      sector: 'Yazılım',
      applicationCount: 0,
    });

    const updated = await json<Company>(user, 'PATCH', `/api/companies/${company.id}`, {
      sector: null,
      notes: 'İK: Ayşe',
    });
    expect(updated).toMatchObject({
      sector: null,
      notes: 'İK: Ayşe',
      website: 'https://acme.example',
    });

    const list = await json<{ companies: Company[] }>(user, 'GET', '/api/companies');
    expect(list.companies.map((c) => c.name)).toEqual(['Acme Teknoloji']);

    expect((await user.request('DELETE', `/api/companies/${company.id}`)).statusCode).toBe(204);
    expect((await user.request('GET', `/api/companies/${company.id}`)).statusCode).toBe(404);
  });

  it('aynı adı büyük/küçük harf farkıyla da ikinci kez kabul etmez', async () => {
    const user = await newUser();
    await json(user, 'POST', '/api/companies', { name: 'Globex' });
    const res = await user.request('POST', '/api/companies', { name: 'GLOBEX' });
    expect(res.statusCode).toBe(409);
  });

  it('javascript: gibi tehlikeli bağlantıları reddeder (XSS)', async () => {
    const user = await newUser();
    const res = await user.request('POST', '/api/companies', {
      name: 'Kötü',
      website: 'javascript:alert(1)',
    });
    expect(res.statusCode).toBe(400);
  });

  it('başvurusu olan şirket silinemez; şirket sayfası tüm başvuruları gösterir', async () => {
    const user = await newUser();
    const a1 = await createApplication(user, {
      companyName: 'Initech',
      positionTitle: 'Veri Analisti',
    });
    await createApplication(user, { companyId: a1.company.id, positionTitle: 'Veri Bilimci' });
    await json(user, 'POST', `/api/applications/${a1.id}/archive`, undefined, 200);

    const detail = await json<Company & { applications: { positionTitle: string }[] }>(
      user,
      'GET',
      `/api/companies/${a1.company.id}`,
    );
    expect(detail.applicationCount).toBe(2);
    // Arşivdekiler dahil, tek sayfada.
    expect(detail.applications.map((a) => a.positionTitle).sort()).toEqual([
      'Veri Analisti',
      'Veri Bilimci',
    ]);

    const res = await user.request('DELETE', `/api/companies/${a1.company.id}`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'company_has_applications' });
  });
});

describe('CV versiyonları (FR-08)', () => {
  it('oluşturur; aynı etiketi reddeder; silinince başvurudaki bağlantı kalkar', async () => {
    const user = await newUser();
    const cv = await json<CvVersion>(user, 'POST', '/api/cv-versions', {
      label: 'SnA Data AI',
      fileName: 'cv-data-ai.pdf',
    });
    expect(
      (await user.request('POST', '/api/cv-versions', { label: 'sna data ai' })).statusCode,
    ).toBe(409);

    const application = await createApplication(user, {
      companyName: 'Hooli',
      positionTitle: 'ML Mühendisi',
      cvVersionId: cv.id,
    });
    expect(application.cvVersion).toEqual({ id: cv.id, label: 'SnA Data AI' });
    const list = await json<{ cvVersions: CvVersion[] }>(user, 'GET', '/api/cv-versions');
    expect(list.cvVersions[0]?.applicationCount).toBe(1);

    expect((await user.request('DELETE', `/api/cv-versions/${cv.id}`)).statusCode).toBe(204);
    const after = await json<ApplicationDetail>(user, 'GET', `/api/applications/${application.id}`);
    expect(after.cvVersion).toBeNull();
  });
});

describe('başvurular (FR-04, FR-05, FR-06, NFR-09)', () => {
  it('yalnızca şirket adı ve pozisyonla oluşturulur; aynı şirket adı yeniden kullanılır', async () => {
    const user = await newUser();
    const first = await createApplication(user, {
      companyName: 'Umbrella',
      positionTitle: 'Analist',
    });
    const second = await createApplication(user, {
      companyName: 'UMBRELLA',
      positionTitle: 'Uzman',
    });
    expect(second.company.id).toBe(first.company.id);
    expect(first).toMatchObject({
      currentStage: 'saved',
      appliedAt: null,
      jobUrl: null,
      archivedAt: null,
    });
    // İlk aşama da geçmişe yazılır.
    expect(first.stageHistory).toEqual([
      expect.objectContaining({ fromStage: null, toStage: 'saved' }),
    ]);
  });

  it('tüm alanları kaydeder; başvuru tarihi verilirse aşama "Başvuruldu" olur', async () => {
    const user = await newUser();
    const created = await createApplication(user, {
      companyName: 'Stark',
      positionTitle: 'Veri Mühendisi',
      jobUrl: 'https://kariyer.example/ilan/42',
      source: 'kariyer_net',
      location: 'İstanbul',
      workMode: 'hybrid',
      salaryExpectation: '90-110 bin TL',
      appliedAt: '2026-10-01',
      notes: 'Referans: Mehmet',
    });
    expect(created).toMatchObject({
      currentStage: 'applied',
      appliedAt: '2026-10-01',
      source: 'kariyer_net',
      workMode: 'hybrid',
      salaryExpectation: '90-110 bin TL',
    });
  });

  it('PATCH: null alanı temizler, gönderilmeyen alana dokunmaz, aşamayı değiştirmez', async () => {
    const user = await newUser();
    const created = await createApplication(user, {
      companyName: 'Wayne',
      positionTitle: 'Analist',
      location: 'Ankara',
      notes: 'ilk not',
    });
    const updated = await json<ApplicationDetail>(
      user,
      'PATCH',
      `/api/applications/${created.id}`,
      {
        notes: null,
        positionTitle: 'Kıdemli Analist',
      },
    );
    expect(updated).toMatchObject({
      notes: null,
      location: 'Ankara',
      positionTitle: 'Kıdemli Analist',
    });

    const res = await user.request('PATCH', `/api/applications/${created.id}`, {
      currentStage: 'offer',
    });
    expect(res.statusCode).toBe(400);
  });

  it('aşama değişikliği geçmişe eklenir ve başvuru tarihini bugünle doldurur', async () => {
    const user = await newUser();
    const created = await createApplication(user, {
      companyName: 'Cyberdyne',
      positionTitle: 'Analist',
    });
    await json(user, 'POST', `/api/applications/${created.id}/stage`, { stage: 'applied' }, 200);
    const detail = await json<ApplicationDetail>(
      user,
      'POST',
      `/api/applications/${created.id}/stage`,
      { stage: 'technical' },
      200,
    );
    expect(detail.currentStage).toBe('technical');
    expect(detail.appliedAt).toBe(todayIn('Europe/Istanbul'));
    expect(detail.stageHistory.map((h) => [h.fromStage, h.toStage])).toEqual([
      [null, 'saved'],
      ['saved', 'applied'],
      ['applied', 'technical'],
    ]);

    const same = await user.request('POST', `/api/applications/${created.id}/stage`, {
      stage: 'technical',
    });
    expect(same.statusCode).toBe(409);
    const invalid = await user.request('POST', `/api/applications/${created.id}/stage`, {
      stage: 'hired',
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('aşama geçmişi uygulama rolüyle değiştirilemez veya silinemez (FR-06)', async () => {
    const sql = postgres(testDb.appUrl, { max: 1 });
    try {
      await expect(sql`update stage_history set to_stage = 'offer'`).rejects.toThrow(
        /permission denied/,
      );
      await expect(sql`delete from stage_history`).rejects.toThrow(/permission denied/);
    } finally {
      await sql.end();
    }
  });
});

describe('arşiv ve silme (FR-15)', () => {
  it('arşivlenen başvuru varsayılan listede görünmez, geri alınabilir', async () => {
    const user = await newUser();
    const created = await createApplication(user, {
      companyName: 'Soylent',
      positionTitle: 'Analist',
    });
    await json(user, 'POST', `/api/applications/${created.id}/archive`, undefined, 200);

    type List = { applications: { id: string }[] };
    expect((await json<List>(user, 'GET', '/api/applications')).applications).toHaveLength(0);
    expect(
      (await json<List>(user, 'GET', '/api/applications?archived=only')).applications,
    ).toHaveLength(1);

    await json(user, 'POST', `/api/applications/${created.id}/unarchive`, undefined, 200);
    expect((await json<List>(user, 'GET', '/api/applications')).applications).toHaveLength(1);
  });

  it('listeyi aşamaya göre filtreler; bilinmeyen sorgu parametresini reddeder', async () => {
    const user = await newUser();
    const a = await createApplication(user, { companyName: 'Tyrell', positionTitle: 'A' });
    await createApplication(user, { companyName: 'Tyrell', positionTitle: 'B' });
    await json(user, 'POST', `/api/applications/${a.id}/stage`, { stage: 'offer' }, 200);
    const offers = await json<{ applications: { id: string }[] }>(
      user,
      'GET',
      '/api/applications?stage=offer',
    );
    expect(offers.applications.map((x) => x.id)).toEqual([a.id]);
    expect((await user.request('GET', '/api/applications?sql=1')).statusCode).toBe(400);
  });

  it('silme, aşama geçmişini ve etkinlikleri de kalıcı olarak siler', async () => {
    const user = await newUser();
    const created = await createApplication(user, {
      companyName: 'Oscorp',
      positionTitle: 'Analist',
    });
    await json(user, 'POST', `/api/applications/${created.id}/stage`, { stage: 'applied' }, 200);
    await json(user, 'POST', `/api/applications/${created.id}/activities`, {
      type: 'call',
      occurredAt: '2026-10-05T10:00:00+03:00',
    });

    expect((await user.request('DELETE', `/api/applications/${created.id}`)).statusCode).toBe(204);
    const [counts] = await admin<{ history: number; activities: number }[]>`
      select
        (select count(*)::int from stage_history where application_id = ${created.id}) as history,
        (select count(*)::int from activities where application_id = ${created.id}) as activities`;
    expect(counts).toEqual({ history: 0, activities: 0 });
  });
});

describe('etkinlikler (FR-07)', () => {
  it('ekler, en yeniden eskiye listeler, günceller ve siler', async () => {
    const user = await newUser();
    const created = await createApplication(user, {
      companyName: 'Massive',
      positionTitle: 'Analist',
    });
    const url = `/api/applications/${created.id}/activities`;
    const older = await json<Activity>(user, 'POST', url, {
      type: 'email',
      occurredAt: '2026-10-01T09:00:00+03:00',
      contactName: 'Zeynep (İK)',
    });
    await json<Activity>(user, 'POST', url, {
      type: 'interview',
      occurredAt: '2026-10-03T14:00:00+03:00',
      notes: 'SQL ve Python soruları',
    });

    const detail = await json<ApplicationDetail>(user, 'GET', `/api/applications/${created.id}`);
    expect(detail.activities.map((a) => a.type)).toEqual(['interview', 'email']);
    expect(older.occurredAt).toBe('2026-10-01T06:00:00.000Z');

    const updated = await json<Activity>(user, 'PATCH', `/api/activities/${older.id}`, {
      contactName: null,
      notes: 'Teşekkür e-postası',
    });
    expect(updated).toMatchObject({
      contactName: null,
      notes: 'Teşekkür e-postası',
      type: 'email',
    });

    expect((await user.request('DELETE', `/api/activities/${older.id}`)).statusCode).toBe(204);
    expect((await user.request('DELETE', `/api/activities/${older.id}`)).statusCode).toBe(404);
  });

  it('geçersiz tür veya tarihi reddeder', async () => {
    const user = await newUser();
    const created = await createApplication(user, { companyName: 'Vandelay', positionTitle: 'X' });
    const url = `/api/applications/${created.id}/activities`;
    expect(
      (await user.request('POST', url, { type: 'fax', occurredAt: '2026-10-01T09:00:00Z' }))
        .statusCode,
    ).toBe(400);
    expect((await user.request('POST', url, { type: 'call', occurredAt: 'dün' })).statusCode).toBe(
      400,
    );
  });
});

describe('yetkilendirme: başka kullanıcının kayıtlarına erişim (A01)', () => {
  it("B kullanıcısı A'nın hiçbir kaydını göremez, değiştiremez, silemez; her biri 404 döner", async () => {
    const a = await newUser();
    const b = await newUser();
    const cv = await json<CvVersion>(a, 'POST', '/api/cv-versions', { label: 'A CV' });
    const app1 = await createApplication(a, {
      companyName: 'A Şirketi',
      positionTitle: 'A Pozisyonu',
      cvVersionId: cv.id,
      salaryExpectation: 'gizli maaş',
    });
    const activity = await json<Activity>(a, 'POST', `/api/applications/${app1.id}/activities`, {
      type: 'call',
      occurredAt: '2026-10-05T10:00:00Z',
    });
    const companyId = app1.company.id;

    const attempts: [method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown][] = [
      ['GET', `/api/companies/${companyId}`],
      ['PATCH', `/api/companies/${companyId}`, { name: 'Ele geçirildi' }],
      ['DELETE', `/api/companies/${companyId}`],
      ['PATCH', `/api/cv-versions/${cv.id}`, { label: 'Ele geçirildi' }],
      ['DELETE', `/api/cv-versions/${cv.id}`],
      ['GET', `/api/applications/${app1.id}`],
      ['PATCH', `/api/applications/${app1.id}`, { notes: 'Ele geçirildi' }],
      ['DELETE', `/api/applications/${app1.id}`],
      ['POST', `/api/applications/${app1.id}/stage`, { stage: 'rejected' }],
      ['POST', `/api/applications/${app1.id}/archive`],
      ['POST', `/api/applications/${app1.id}/unarchive`],
      [
        'POST',
        `/api/applications/${app1.id}/activities`,
        { type: 'call', occurredAt: '2026-10-05T10:00:00Z' },
      ],
      ['PATCH', `/api/activities/${activity.id}`, { notes: 'Ele geçirildi' }],
      ['DELETE', `/api/activities/${activity.id}`],
    ];
    for (const [method, url, body] of attempts) {
      const res = await b.request(method, url, body);
      expect({ method, url, status: res.statusCode }).toEqual({ method, url, status: 404 });
      expect(res.body).not.toContain('gizli maaş');
    }

    // B'nin listelerinde A'nın hiçbir kaydı yok.
    for (const url of [
      '/api/companies',
      '/api/cv-versions',
      '/api/applications?archived=include',
    ]) {
      const res = await b.request('GET', url);
      expect(res.body).not.toContain(companyId);
      expect(res.body).not.toContain(cv.id);
      expect(res.body).not.toContain(app1.id);
    }

    // B, A'nın şirketini veya CV'sini kendi başvurusuna bağlayamaz.
    const withForeignCompany = await b.request('POST', '/api/applications', {
      companyId,
      positionTitle: 'X',
    });
    expect(withForeignCompany.statusCode).toBe(400);
    const withForeignCv = await b.request('POST', '/api/applications', {
      companyName: 'B Şirketi',
      positionTitle: 'X',
      cvVersionId: cv.id,
    });
    expect(withForeignCv.statusCode).toBe(400);

    // A'nın kayıtları değişmeden duruyor.
    const intact = await json<ApplicationDetail>(a, 'GET', `/api/applications/${app1.id}`);
    expect(intact).toMatchObject({ currentStage: 'saved', notes: null, archivedAt: null });
    expect(intact.activities).toHaveLength(1);
    expect(intact.cvVersion?.label).toBe('A CV');
  });

  it('veritabanı da başka kullanıcının şirketine bağlanmayı engeller (bileşik yabancı anahtar)', async () => {
    const a = await newUser();
    const b = await newUser();
    const aApp = await createApplication(a, { companyName: 'A Ltd', positionTitle: 'X' });
    await createApplication(b, { companyName: 'B Ltd', positionTitle: 'Y' });
    const [bUser] = await admin<{ user_id: string }[]>`
      select user_id from companies where name = 'B Ltd'`;

    // Uygulama katmanını atlayıp doğrudan SQL ile: B'nin bağlamında A'nın şirket ID'si.
    const sql = postgres(testDb.appUrl, { max: 1 });
    try {
      await expect(
        sql.begin(async (tx) => {
          await tx`select set_config('app.user_id', ${bUser?.user_id ?? ''}, true)`;
          await tx`insert into applications (user_id, company_id, position_title)
                   values (${bUser?.user_id ?? ''}, ${aApp.company.id}, 'Sızma')`;
        }),
      ).rejects.toThrow(/foreign key/);
    } finally {
      await sql.end();
    }
  });

  it('geçersiz biçimli ID 404 döner', async () => {
    const user = await newUser();
    expect((await user.request('GET', '/api/applications/1')).statusCode).toBe(404);
    expect((await user.request('GET', "/api/applications/' OR 1=1 --")).statusCode).toBe(404);
  });

  it("oturumsuz istek 401, CSRF token'sız istek 403 alır", async () => {
    expect((await new TestAgent(app).request('GET', '/api/applications')).statusCode).toBe(401);
    const user = await newUser();
    user.csrf = undefined;
    const res = await user.request('POST', '/api/companies', { name: 'X' });
    expect(res.statusCode).toBe(403);
  });
});

describe('arama ve filtreler (FR-10)', () => {
  type List = { applications: { positionTitle: string; company: { name: string } }[] };
  const titles = (list: List) => list.applications.map((a) => a.positionTitle).sort();

  it('şirket adı veya pozisyonda büyük/küçük harf duyarsız arar', async () => {
    const user = await newUser();
    await createApplication(user, { companyName: 'Data Corp', positionTitle: 'Analist' });
    await createApplication(user, { companyName: 'Beta', positionTitle: 'Veri Bilimci (Data)' });
    await createApplication(user, { companyName: 'Gamma', positionTitle: 'Frontend' });
    const res = await json<List>(user, 'GET', '/api/applications?q=DATA');
    expect(titles(res)).toEqual(['Analist', 'Veri Bilimci (Data)']);
  });

  it('% ve _ karakterleri joker değil, düz metin olarak aranır', async () => {
    const user = await newUser();
    await createApplication(user, { companyName: 'Acme', positionTitle: 'Analist' });
    await createApplication(user, { companyName: 'Acme', positionTitle: '%100 uzaktan' });
    expect(titles(await json<List>(user, 'GET', '/api/applications?q=%25'))).toEqual([
      '%100 uzaktan',
    ]);
    expect(titles(await json<List>(user, 'GET', '/api/applications?q=_'))).toEqual([]);
  });

  it('kaynak, CV versiyonu ve başvuru tarihi aralığına göre filtreler', async () => {
    const user = await newUser();
    const cv = await json<CvVersion>(user, 'POST', '/api/cv-versions', { label: 'Analytics' });
    await createApplication(user, {
      companyName: 'A',
      positionTitle: 'Eylül LinkedIn',
      source: 'linkedin',
      appliedAt: '2026-09-15',
    });
    await createApplication(user, {
      companyName: 'B',
      positionTitle: 'Ekim Kariyer',
      source: 'kariyer_net',
      appliedAt: '2026-10-02',
      cvVersionId: cv.id,
    });
    await createApplication(user, { companyName: 'C', positionTitle: 'Tarihsiz' });

    expect(titles(await json<List>(user, 'GET', '/api/applications?source=linkedin'))).toEqual([
      'Eylül LinkedIn',
    ]);
    expect(titles(await json<List>(user, 'GET', `/api/applications?cvVersionId=${cv.id}`))).toEqual(
      ['Ekim Kariyer'],
    );
    expect(
      titles(
        await json<List>(
          user,
          'GET',
          '/api/applications?appliedFrom=2026-10-01&appliedTo=2026-10-31',
        ),
      ),
    ).toEqual(['Ekim Kariyer']);
    expect((await user.request('GET', '/api/applications?appliedFrom=dun')).statusCode).toBe(400);
  });
});

describe('takip işareti (FR-11) ve ayarlar', () => {
  /** Başvurunun tüm temas tarihlerini `days` gün geriye çeker. */
  async function age(id: string, days: number) {
    await admin`update applications
      set created_at = now() - make_interval(days => ${days}),
          applied_at = (now() - make_interval(days => ${days}))::date
      where id = ${id}`;
    await admin`update stage_history set changed_at = now() - make_interval(days => ${days})
      where application_id = ${id}`;
  }

  it('süren başvuruda varsayılan 14 gün temas yoksa işaretler; yeni etkinlik işareti kaldırır', async () => {
    const user = await newUser();
    const old = await createApplication(user, {
      companyName: 'Eski',
      positionTitle: 'Bekleyen',
      appliedAt: '2026-01-01',
    });
    const fresh = await createApplication(user, {
      companyName: 'Yeni',
      positionTitle: 'Taze',
      appliedAt: '2026-01-01',
    });
    const saved = await createApplication(user, { companyName: 'Kayıt', positionTitle: 'Taslak' });
    const closed = await createApplication(user, {
      companyName: 'Kapalı',
      positionTitle: 'Red',
      appliedAt: '2026-01-01',
    });
    await json(user, 'POST', `/api/applications/${closed.id}/stage`, { stage: 'rejected' }, 200);
    await age(old.id, 20);
    await age(fresh.id, 5);
    await age(saved.id, 20);
    await age(closed.id, 20);

    const detail = await json<ApplicationDetail>(user, 'GET', `/api/applications/${old.id}`);
    expect(detail.needsFollowUp).toBe(true);
    const flagged = await json<{ applications: { id: string }[] }>(
      user,
      'GET',
      '/api/applications?followUp=true',
    );
    expect(flagged.applications.map((a) => a.id)).toEqual([old.id]);

    await json(user, 'POST', `/api/applications/${old.id}/activities`, {
      type: 'email',
      occurredAt: new Date().toISOString(),
    });
    const after = await json<ApplicationDetail>(user, 'GET', `/api/applications/${old.id}`);
    expect(after.needsFollowUp).toBe(false);
    expect(Date.now() - new Date(after.lastActivityAt).getTime()).toBeLessThan(60_000);
  });

  it('gün sayısı kullanıcı ayarıyla değişir; geçersiz değer reddedilir', async () => {
    const user = await newUser();
    expect(await json(user, 'GET', '/api/settings')).toEqual({ followUpDays: 14, locale: 'tr' });
    const created = await createApplication(user, {
      companyName: 'Ayar',
      positionTitle: 'X',
      appliedAt: '2026-01-01',
    });
    await age(created.id, 20);
    expect(
      (await json<ApplicationDetail>(user, 'GET', `/api/applications/${created.id}`)).needsFollowUp,
    ).toBe(true);

    expect(await json(user, 'PATCH', '/api/settings', { followUpDays: 30 })).toEqual({
      followUpDays: 30,
      locale: 'tr',
    });
    expect(
      (await json<ApplicationDetail>(user, 'GET', `/api/applications/${created.id}`)).needsFollowUp,
    ).toBe(false);

    expect((await user.request('PATCH', '/api/settings', { followUpDays: 0 })).statusCode).toBe(
      400,
    );
    // Başka kullanıcının ayarı etkilenmez.
    expect(await json(await newUser(), 'GET', '/api/settings')).toEqual({
      followUpDays: 14,
      locale: 'tr',
    });
  });

  it('arayüz dili ayrı güncellenir ve oturum bilgisinde döner (FR-16)', async () => {
    const user = await newUser();
    const other = await newUser();
    expect(await json(user, 'PATCH', '/api/settings', { locale: 'en' })).toEqual({
      followUpDays: 14,
      locale: 'en',
    });
    expect(await json(user, 'GET', '/api/auth/me')).toMatchObject({ locale: 'en' });
    expect((await user.request('PATCH', '/api/settings', { locale: 'de' })).statusCode).toBe(400);
    expect((await user.request('PATCH', '/api/settings', {})).statusCode).toBe(400);
    expect(await json(other, 'GET', '/api/auth/me')).toMatchObject({ locale: 'tr' });
  });
});

describe('todayIn', () => {
  it('kullanıcının saat dilimindeki tarihi verir', () => {
    // UTC 22:30 → İstanbul'da ertesi gün 01:30
    const now = new Date('2026-10-06T22:30:00Z');
    expect(todayIn('Europe/Istanbul', now)).toBe('2026-10-07');
    expect(todayIn('UTC', now)).toBe('2026-10-06');
  });
});
