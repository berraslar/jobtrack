import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EMPTY_PROFILE,
  type AiStatus,
  type JobDescription,
  type MasterCv,
  type MasterCvImport,
  type TailorDraft,
  type TailoredCv,
} from '@jobtrack/shared';
import { buildApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/client.js';
import { FakeProvider } from '../ai/fake.js';
import type { ExtractedText } from '../profile/cv-parser-client.js';
import {
  startTestDatabase,
  TestAgent,
  testConfig,
  type TestDatabase,
  testMailer,
} from '../../test/helpers.js';

// FR-23 (ADR-0010): Ana CV ve başvuruya bağlı ilan metni.

const PASSWORD = 'cok-guvenli-parola-2026';
const MASTER = `# Ayşe Yılmaz

## Deneyim
### Veri Bilimci — Örnek Analitik A.Ş. (03/2021 – Halen)
- Talep tahmini modelleri
`;

let testDb: TestDatabase;
let database: Database;
let admin: postgres.Sql;
let app: FastifyInstance;
let counter = 0;
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const parser: { received: Buffer[]; next: () => Promise<ExtractedText> } = {
  received: [],
  next: () =>
    Promise.resolve({
      text: 'Ayşe Yılmaz\nayse@example.com\n\nDENEYİM\n• Talep tahmini modelleri',
      method: 'text',
    }),
};

beforeAll(async () => {
  testDb = await startTestDatabase();
  database = createDatabase(testDb.appUrl);
  admin = postgres(testDb.adminUrl, { max: 1, onnotice: () => undefined });
  app = buildApp(testConfig(), {
    db: database.db,
    mailer: testMailer,
    isPwned: null,
    rateLimit: false,
    extractText: (pdf) => {
      parser.received.push(pdf);
      return parser.next();
    },
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
  const email = `uyarla${String(++counter)}@example.com`;
  await agent.register(email, PASSWORD);
  return { agent, email };
}

async function createApplication(agent: TestAgent): Promise<string> {
  const res = await agent.request('POST', '/api/applications', {
    companyName: 'Acme',
    positionTitle: 'Veri Bilimci',
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ id: string }>().id;
}

describe('Ana CV (FR-23)', () => {
  it('boş başlar, kaydedilir ve okunur; Markdown boşlukları korunur', async () => {
    const { agent } = await newUser();
    const empty = await agent.request('GET', '/api/master-cv');
    expect(empty.statusCode).toBe(200);
    expect(empty.json<MasterCv>()).toEqual({ markdown: '', updatedAt: null });

    const saved = await agent.request('PUT', '/api/master-cv', { markdown: MASTER });
    expect(saved.statusCode).toBe(200);
    expect(saved.json<MasterCv>().markdown).toBe(MASTER);
    expect(saved.json<MasterCv>().updatedAt).not.toBeNull();

    const read = await agent.request('GET', '/api/master-cv');
    expect(read.json<MasterCv>().markdown).toBe(MASTER);
  });

  it('sınırı aşan metni ve tanımsız alanları reddeder', async () => {
    const { agent } = await newUser();
    const tooLong = await agent.request('PUT', '/api/master-cv', { markdown: 'a'.repeat(30_001) });
    expect(tooLong.statusCode).toBe(400);
    const extra = await agent.request('PUT', '/api/master-cv', { markdown: 'x', userId: 'x' });
    expect(extra.statusCode).toBe(400);
    // 30.000 karakterlik Türkçe metin gövde sınırına takılmaz.
    const full = await agent.request('PUT', '/api/master-cv', { markdown: 'ğ'.repeat(30_000) });
    expect(full.statusCode).toBe(200);
  });

  it('her kullanıcı yalnızca kendi Ana CV’sini görür', async () => {
    const a = await newUser();
    const b = await newUser();
    await a.agent.request('PUT', '/api/master-cv', { markdown: MASTER });
    const other = await b.agent.request('GET', '/api/master-cv');
    expect(other.json<MasterCv>()).toEqual({ markdown: '', updatedAt: null });
  });

  it('oturum olmadan erişilemez', async () => {
    expect((await new TestAgent(app).request('GET', '/api/master-cv')).statusCode).toBe(401);
    expect(
      (await new TestAgent(app).request('PUT', '/api/master-cv', { markdown: 'x' })).statusCode,
    ).toBe(401);
  });
});

describe('PDF’ten Ana CV (FR-23)', () => {
  const importPdf = (agent: TestAgent, body: Buffer) =>
    agent.request('POST', '/api/master-cv/import', body, { 'content-type': 'application/pdf' });

  it('PDF’i okuyup Markdown taslağı döner; dosyayı ve taslağı kaydetmez', async () => {
    const { agent } = await newUser();
    parser.received.length = 0;
    const res = await importPdf(agent, PDF);
    expect(res.statusCode).toBe(200);
    expect(res.json<MasterCvImport>()).toEqual({
      markdown: '# Ayşe Yılmaz\n\nayse@example.com\n\n## DENEYİM\n\n- Talep tahmini modelleri',
      method: 'text',
    });
    expect(parser.received).toHaveLength(1);
    const saved = await agent.request('GET', '/api/master-cv');
    expect(saved.json<MasterCv>()).toEqual({ markdown: '', updatedAt: null });
    const [{ count }] = await admin<
      [{ count: string }]
    >`select count(*)::text as count from cv_files`;
    expect(count).toBe('0');
  });

  it('PDF imzası olmayan dosyayı ayrıştırıcıya göndermeden reddeder', async () => {
    const { agent } = await newUser();
    parser.received.length = 0;
    const res = await importPdf(agent, Buffer.from('<html>bu bir pdf değil</html>'));
    expect(res.statusCode).toBe(400);
    expect(res.json<{ code: string }>().code).toBe('invalid_file_type');
    expect(parser.received).toHaveLength(0);
  });

  it('metin okunamazsa 422 döner', async () => {
    const { agent } = await newUser();
    const previous = parser.next;
    parser.next = () => Promise.resolve({ text: '  \n ', method: 'ocr' });
    try {
      const res = await importPdf(agent, PDF);
      expect(res.statusCode).toBe(422);
      expect(res.json<{ code: string }>().code).toBe('cv_unreadable');
    } finally {
      parser.next = previous;
    }
  });

  it('oturum olmadan erişilemez', async () => {
    parser.received.length = 0;
    expect((await importPdf(new TestAgent(app), PDF)).statusCode).toBe(401);
    expect(parser.received).toHaveLength(0);
  });
});

describe('İlan metni (FR-23)', () => {
  it('başvuruya kaydedilir ve okunur; boş metin "yok" olur', async () => {
    const { agent } = await newUser();
    const id = await createApplication(agent);
    const initial = await agent.request('GET', `/api/applications/${id}/job-description`);
    expect(initial.json<JobDescription>()).toEqual({ jobDescription: null });

    const text = 'Python ve SQL bilen, A/B testi deneyimli veri bilimci arıyoruz.';
    const put = await agent.request('PUT', `/api/applications/${id}/job-description`, {
      jobDescription: text,
    });
    expect(put.statusCode).toBe(200);
    expect(put.json<JobDescription>()).toEqual({ jobDescription: text });

    const cleared = await agent.request('PUT', `/api/applications/${id}/job-description`, {
      jobDescription: '   ',
    });
    expect(cleared.json<JobDescription>()).toEqual({ jobDescription: null });
  });

  it('ilan metni başvuru listesi yanıtına girmez', async () => {
    const { agent } = await newUser();
    const id = await createApplication(agent);
    await agent.request('PUT', `/api/applications/${id}/job-description`, {
      jobDescription: 'ilan',
    });
    const list = await agent.request('GET', '/api/applications');
    expect(list.body).not.toContain('jobDescription');
  });

  it('sınırı aşan metni reddeder', async () => {
    const { agent } = await newUser();
    const id = await createApplication(agent);
    const res = await agent.request('PUT', `/api/applications/${id}/job-description`, {
      jobDescription: 'a'.repeat(20_001),
    });
    expect(res.statusCode).toBe(400);
  });

  it('A kullanıcısı B’nin başvurusunun ilan metnini okuyamaz ve değiştiremez (404)', async () => {
    const a = await newUser();
    const b = await newUser();
    const id = await createApplication(b.agent);
    await b.agent.request('PUT', `/api/applications/${id}/job-description`, {
      jobDescription: 'B’nin ilanı',
    });

    const read = await a.agent.request('GET', `/api/applications/${id}/job-description`);
    expect(read.statusCode).toBe(404);
    const write = await a.agent.request('PUT', `/api/applications/${id}/job-description`, {
      jobDescription: 'üzerine yaz',
    });
    expect(write.statusCode).toBe(404);

    const still = await b.agent.request('GET', `/api/applications/${id}/job-description`);
    expect(still.json<JobDescription>()).toEqual({ jobDescription: 'B’nin ilanı' });
  });

  it('geçersiz kimlik 400, var olmayan başvuru 404 döner', async () => {
    const { agent } = await newUser();
    expect((await agent.request('GET', '/api/applications/abc/job-description')).statusCode).toBe(
      400,
    );
    expect(
      (
        await agent.request(
          'GET',
          '/api/applications/0199b5a0-0000-7000-8000-000000000999/job-description',
        )
      ).statusCode,
    ).toBe(404);
  });
});

describe('Dışa aktarma ve silme (FR-14)', () => {
  it('Ana CV ve ilan metni JSON dışa aktarımında yer alır', async () => {
    const { agent } = await newUser();
    const id = await createApplication(agent);
    await agent.request('PUT', '/api/master-cv', { markdown: MASTER });
    await agent.request('PUT', `/api/applications/${id}/job-description`, {
      jobDescription: 'ilan metni',
    });
    const res = await agent.request('GET', '/api/account/export?format=json');
    const data = res.json<{
      masterCv: { markdown: string } | null;
      applications: { jobDescription: string | null }[];
    }>();
    expect(data.masterCv?.markdown).toBe(MASTER);
    expect(data.applications[0]?.jobDescription).toBe('ilan metni');
  });

  it('kullanıcı silinince Ana CV de silinir', async () => {
    const { agent, email } = await newUser();
    await agent.request('PUT', '/api/master-cv', { markdown: MASTER });
    await admin`delete from users where email = ${email}`;
    const [row] = await admin<{ n: number }[]>`select count(*)::int as n from master_cvs m
      where not exists (select 1 from users u where u.id = m.user_id)`;
    expect(row?.n).toBe(0);
  });
});

// FR-24 (ADR-0010): yapay zekâ ile uyarlama ve sürümler. Sahte sağlayıcıyla; veri dışarı çıkmaz.

describe('Yapay zekâ ile uyarlama (FR-24)', () => {
  let aiApp: FastifyInstance;
  const fake = new FakeProvider();

  beforeAll(async () => {
    aiApp = buildApp(testConfig(), {
      db: database.db,
      mailer: testMailer,
      isPwned: null,
      rateLimit: false,
      ai: fake,
    });
    await aiApp.ready();
  });

  afterAll(async () => {
    await aiApp.close();
  });

  const PROFILE_MASTER = `# Ayşe Yılmaz
ayse.yilmaz@example.com · +90 532 123 45 67 · Moda Cad. No: 12

## Deneyim
### Veri Bilimci — Örnek Analitik A.Ş. (03/2021 – Halen, 3 yıl)
- Python ile talep tahmini
`;

  async function ready(jobDescription = 'Python, SQL ve Airflow bilen Veri Bilimci') {
    const agent = new TestAgent(aiApp);
    const email = `yz${String(++counter)}@example.com`;
    await agent.register(email, PASSWORD);
    await agent.request('PUT', '/api/profile', {
      ...EMPTY_PROFILE,
      fullName: 'Ayşe Yılmaz',
      email: 'ayse.yilmaz@example.com',
    });
    await agent.request('PUT', '/api/master-cv', { markdown: PROFILE_MASTER });
    const id = await createApplication(agent);
    await agent.request('PUT', `/api/applications/${id}/job-description`, { jobDescription });
    return { agent, id };
  }

  it('özellik kapalıyken durum "kapalı" döner ve uyarlama 503 verir', async () => {
    const { agent } = await newUser();
    const status = await agent.request('GET', '/api/ai/status');
    expect(status.json<AiStatus>()).toEqual({ enabled: false, model: null });
    const id = await createApplication(agent);
    const res = await agent.request('POST', `/api/applications/${id}/tailor`, { consent: true });
    expect(res.statusCode).toBe(503);
    expect(res.json<{ code: string }>().code).toBe('ai_disabled');
  });

  it('açık onay olmadan göndermez', async () => {
    const { agent, id } = await ready();
    const before = fake.calls.length;
    for (const body of [{}, { consent: false }, { consent: 'true' }]) {
      const res = await agent.request('POST', `/api/applications/${id}/tailor`, body);
      expect(res.statusCode).toBe(400);
    }
    expect(fake.calls.length).toBe(before);
  });

  it('kişisel bilgileri maskeleyerek gönderir, yanıtta geri yerleştirir ve kaydetmez', async () => {
    const { agent, id } = await ready();
    const status = await agent.request('GET', '/api/ai/status');
    expect(status.json<AiStatus>()).toEqual({ enabled: true, model: 'fake:deterministic' });

    const res = await agent.request('POST', `/api/applications/${id}/tailor`, {
      consent: true,
      extraMaskTerms: ['Moda Cad. No: 12'],
    });
    expect(res.statusCode).toBe(200);
    const sent = fake.calls.at(-1);
    for (const secret of ['Ayşe', 'Yılmaz', 'ayse.yilmaz@example.com', '532 123', 'Moda Cad']) {
      expect(sent?.maskedCv).not.toContain(secret);
    }
    expect(sent?.maskedCv).toContain('Örnek Analitik A.Ş. (03/2021 – Halen, 3 yıl)');
    expect(sent?.companyName).toBe('Acme');
    // Tek sayfa varsayılan olarak istenir; istemci kapatabilir.
    expect(sent?.onePage).toBe(true);
    const longer = await agent.request('POST', `/api/applications/${id}/tailor`, {
      consent: true,
      onePage: false,
    });
    expect(longer.statusCode).toBe(200);
    expect(fake.calls.at(-1)?.onePage).toBe(false);

    const draft = res.json<TailorDraft>();
    expect(draft.tailoredMarkdown).toBe(PROFILE_MASTER.trim());
    expect(draft.maskedCount).toBeGreaterThanOrEqual(4);
    expect(draft.warnings).toEqual([]);
    expect(draft.missingKeywords).toEqual(expect.arrayContaining(['SQL', 'Airflow']));
    expect(draft.model).toBe('fake:deterministic');

    const list = await agent.request('GET', `/api/applications/${id}/tailored-cvs`);
    expect(list.json<{ tailoredCvs: unknown[] }>().tailoredCvs).toEqual([]);
  });

  it('Ana CV’de olmayan şirket, tarih ve süreyi uyarı olarak döner', async () => {
    const { agent, id } = await ready('Python [[UYDUR]]');
    const res = await agent.request('POST', `/api/applications/${id}/tailor`, { consent: true });
    const texts = res.json<TailorDraft>().warnings.map((w) => `${w.kind}:${w.text}`);
    expect(texts).toEqual(
      expect.arrayContaining([
        'company:Hayali Holding A.Ş.',
        'date:2015',
        'date:2017',
        'duration:2 yıl',
      ]),
    );
  });

  it('ilan metni ya da Ana CV yoksa anlaşılır bir 422 döner', async () => {
    const agent = new TestAgent(aiApp);
    await agent.register(`yz${String(++counter)}@example.com`, PASSWORD);
    const id = await createApplication(agent);
    const noJob = await agent.request('POST', `/api/applications/${id}/tailor`, { consent: true });
    expect(noJob.json<{ code: string }>().code).toBe('job_description_missing');
    await agent.request('PUT', `/api/applications/${id}/job-description`, { jobDescription: 'x' });
    const noCv = await agent.request('POST', `/api/applications/${id}/tailor`, { consent: true });
    expect(noCv.statusCode).toBe(422);
    expect(noCv.json<{ code: string }>().code).toBe('master_cv_missing');
  });

  it('A kullanıcısı B’nin başvurusunu uyarlatamaz (404) ve hiçbir şey gönderilmez', async () => {
    const a = await ready();
    const b = await ready();
    const before = fake.calls.length;
    const res = await a.agent.request('POST', `/api/applications/${b.id}/tailor`, {
      consent: true,
    });
    expect(res.statusCode).toBe(404);
    expect(fake.calls.length).toBe(before);
  });

  it('kullanıcı başına dakikada 5 uyarlama isteğiyle sınırlıdır', async () => {
    const { agent, id } = await ready();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push(
        (await agent.request('POST', `/api/applications/${id}/tailor`, { consent: true }))
          .statusCode,
      );
    }
    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it('sürüm kaydedilir, listelenir, düzenlenir ve silinir; dışa aktarıma girer', async () => {
    const { agent, id } = await ready();
    const created = await agent.request('POST', `/api/applications/${id}/tailored-cvs`, {
      markdown: '# Uyarlanmış CV',
      matchScore: 70,
      missingKeywords: ['Airflow'],
      changes: ['Python öne alındı.'],
      model: 'fake:deterministic',
    });
    expect(created.statusCode).toBe(201);
    const version = created.json<TailoredCv>();
    expect(version).toMatchObject({
      applicationId: id,
      matchScore: 70,
      markdown: '# Uyarlanmış CV',
    });

    const list = await agent.request('GET', `/api/applications/${id}/tailored-cvs`);
    expect(list.json<{ tailoredCvs: TailoredCv[] }>().tailoredCvs.map((v) => v.id)).toEqual([
      version.id,
    ]);

    const edited = await agent.request('PUT', `/api/tailored-cvs/${version.id}`, {
      markdown: '# Elle düzeltildi',
    });
    expect(edited.json<TailoredCv>().markdown).toBe('# Elle düzeltildi');

    const exported = await agent.request('GET', '/api/account/export?format=json');
    const data = exported.json<{ applications: { tailoredCvs: TailoredCv[] }[] }>();
    expect(data.applications[0]?.tailoredCvs[0]?.markdown).toBe('# Elle düzeltildi');

    expect((await agent.request('DELETE', `/api/tailored-cvs/${version.id}`)).statusCode).toBe(204);
    expect((await agent.request('GET', `/api/tailored-cvs/${version.id}`)).statusCode).toBe(404);
  });

  it('boş ve sınırı aşan sürümü reddeder', async () => {
    const { agent, id } = await ready();
    for (const body of [
      { markdown: '  ' },
      { markdown: 'a'.repeat(30_001) },
      { markdown: 'x', matchScore: 101 },
      { markdown: 'x', userId: 'x' },
    ]) {
      expect(
        (await agent.request('POST', `/api/applications/${id}/tailored-cvs`, body)).statusCode,
      ).toBe(400);
    }
  });

  it('A kullanıcısı B’nin sürümlerine erişemez ve B’nin başvurusuna sürüm ekleyemez (404)', async () => {
    const a = await ready();
    const b = await ready();
    const created = await b.agent.request('POST', `/api/applications/${b.id}/tailored-cvs`, {
      markdown: '# B',
    });
    const version = created.json<TailoredCv>();

    expect((await a.agent.request('GET', `/api/tailored-cvs/${version.id}`)).statusCode).toBe(404);
    expect(
      (await a.agent.request('PUT', `/api/tailored-cvs/${version.id}`, { markdown: '# A' }))
        .statusCode,
    ).toBe(404);
    expect((await a.agent.request('DELETE', `/api/tailored-cvs/${version.id}`)).statusCode).toBe(
      404,
    );
    expect(
      (await a.agent.request('GET', `/api/applications/${b.id}/tailored-cvs`)).statusCode,
    ).toBe(404);
    expect(
      (await a.agent.request('POST', `/api/applications/${b.id}/tailored-cvs`, { markdown: '# A' }))
        .statusCode,
    ).toBe(404);

    const still = await b.agent.request('GET', `/api/tailored-cvs/${version.id}`);
    expect(still.json<TailoredCv>().markdown).toBe('# B');
  });

  it('başvuru silinince sürümleri de silinir', async () => {
    const { agent, id } = await ready();
    const version = (
      await agent.request('POST', `/api/applications/${id}/tailored-cvs`, { markdown: '# x' })
    ).json<TailoredCv>();
    expect((await agent.request('DELETE', `/api/applications/${id}`)).statusCode).toBe(204);
    const [row] = await admin<{ n: number }[]>`select count(*)::int as n from tailored_cvs
      where id = ${version.id}`;
    expect(row?.n).toBe(0);
  });
});
