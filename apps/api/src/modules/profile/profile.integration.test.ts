import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, type CvVersion, type Profile, type ProfileDraft } from '@jobtrack/shared';
import { buildApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import {
  lastEmailCode,
  startTestDatabase,
  TestAgent,
  testConfig,
  type TestDatabase,
  testMailer,
} from '../../test/helpers.js';
import type { ExtractedText } from './cv-parser-client.js';

const PASSWORD = 'cok-guvenli-parola-2026';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const CV_TEXT = `Ayse Yilmaz
Data Scientist
ayse@example.com | +90 532 123 45 67 | Istanbul

SKILLS
Python, SQL`;

let testDb: TestDatabase;
let database: Database;
let admin: postgres.Sql;
let app: FastifyInstance;
let counter = 0;
/** Sahte ayrıştırıcı (ADR-0008): gelen baytları kaydeder, ayarlanan yanıtı verir. */
const parser: { received: Buffer[]; next: () => Promise<ExtractedText> } = {
  received: [],
  next: () => Promise.resolve({ text: CV_TEXT, method: 'text' }),
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

const emails = new WeakMap<TestAgent, string>();

async function newUser(): Promise<TestAgent> {
  const agent = new TestAgent(app);
  const email = `profil${String(++counter)}@example.com`;
  await agent.register(email, PASSWORD);
  emails.set(agent, email);
  return agent;
}

async function uploadCv(agent: TestAgent, label: string): Promise<CvVersion> {
  const res = await agent.request('POST', '/api/cv-versions/upload', PDF, {
    'content-type': 'application/pdf',
    'x-file-name': 'cv.pdf',
    'x-cv-label': encodeURIComponent(label),
  });
  expect(res.statusCode).toBe(201);
  return res.json<CvVersion>();
}

const FULL = {
  ...EMPTY_PROFILE,
  fullName: 'Ayşe Yılmaz',
  headline: 'Veri Bilimci',
  email: 'Ayse@Example.com',
  website: 'https://ayse.example.com',
  skills: ['Python', 'SQL'],
  experience: [
    {
      title: 'Kıdemli Veri Bilimci',
      company: 'Örnek A.Ş.',
      start: '2021-03',
      end: null,
      current: true,
      description: 'Model geliştirme',
    },
  ],
  education: [{ school: 'Örnek Üniversitesi', degree: null, start: '2014', end: '2018' }],
};

describe('profil (FR-20)', () => {
  it('ilk okumada boş profil döner; kaydedilen profil aynen geri okunur', async () => {
    const user = await newUser();
    const empty = await user.request('GET', '/api/profile');
    expect(empty.statusCode).toBe(200);
    expect(empty.json<Profile>()).toEqual({ ...EMPTY_PROFILE, updatedAt: null });

    const saved = await user.request('PUT', '/api/profile', FULL);
    expect(saved.statusCode).toBe(200);
    expect(saved.json<Profile>()).toMatchObject({ ...FULL, email: 'ayse@example.com' });
    expect(saved.json<Profile>().updatedAt).not.toBeNull();

    const again = await user.request('GET', '/api/profile');
    expect(again.json<Profile>()).toEqual(saved.json<Profile>());

    // Bütün olarak değiştirilir: gönderilmeyen liste boşalır.
    const replaced = await user.request('PUT', '/api/profile', { ...FULL, skills: [] });
    expect(replaced.json<Profile>().skills).toEqual([]);
  });

  it('geçersiz girdiyi reddeder: javascript: bağlantısı, tanımsız alan, eksik alan', async () => {
    const user = await newUser();
    for (const body of [
      { ...FULL, website: 'javascript:alert(1)' },
      { ...FULL, linkedin: 'ftp://example.com' },
      { ...FULL, userId: '00000000-0000-7000-8000-000000000000' },
      { fullName: 'Eksik' },
      { ...FULL, experience: [{ ...FULL.experience[0], start: '03/2021' }] },
      { ...FULL, skills: Array.from({ length: 101 }, (_, i) => `s${String(i)}`) },
    ]) {
      const res = await user.request('PUT', '/api/profile', body);
      expect(res.statusCode, JSON.stringify(body).slice(0, 80)).toBe(400);
    }
    expect((await user.request('GET', '/api/profile')).json<Profile>().updatedAt).toBeNull();
  });

  it('büyük ama geçerli bir profili kabul eder (256 KB rota sınırı)', async () => {
    const user = await newUser();
    const experience = Array.from({ length: 30 }, () => ({
      ...FULL.experience[0],
      description: 'ğ'.repeat(2000),
    }));
    const res = await user.request('PUT', '/api/profile', { ...FULL, experience });
    expect(res.statusCode).toBe(200);
  });

  it('kullanıcılar birbirinin profilini göremez ve değiştiremez (RLS)', async () => {
    const owner = await newUser();
    const other = await newUser();
    await owner.request('PUT', '/api/profile', FULL);
    expect((await other.request('GET', '/api/profile')).json<Profile>().fullName).toBeNull();
    await other.request('PUT', '/api/profile', { ...EMPTY_PROFILE, fullName: 'Başkası' });
    expect((await owner.request('GET', '/api/profile')).json<Profile>().fullName).toBe(
      'Ayşe Yılmaz',
    );
  });

  it('oturum, CSRF token ve Origin olmadan erişilemez', async () => {
    const anonymous = new TestAgent(app);
    expect((await anonymous.request('GET', '/api/profile')).statusCode).toBe(401);
    expect((await anonymous.request('PUT', '/api/profile', FULL)).statusCode).toBe(401);

    const user = await newUser();
    const csrf = user.csrf;
    user.csrf = undefined;
    expect((await user.request('PUT', '/api/profile', FULL)).statusCode).toBe(403);
    user.csrf = csrf;
    const res = await user.request('PUT', '/api/profile', FULL, { origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
  });

  it('profili siler; dışa aktarımda yer alır; hesapla birlikte silinir (FR-14)', async () => {
    const user = await newUser();
    await user.request('PUT', '/api/profile', FULL);
    const exported = await user.request('GET', '/api/account/export?format=json');
    expect(exported.json<{ profile: Profile }>().profile).toMatchObject({
      fullName: 'Ayşe Yılmaz',
    });

    expect((await user.request('DELETE', '/api/profile')).statusCode).toBe(204);
    expect((await user.request('GET', '/api/profile')).json<Profile>().updatedAt).toBeNull();

    await user.request('PUT', '/api/profile', FULL);
    const email = emails.get(user) ?? '';
    await user.request('POST', '/api/account/deletion-code');
    const deleted = await user.request('DELETE', '/api/account', {
      password: PASSWORD,
      confirm: 'SİL',
      emailCode: lastEmailCode(email),
    });
    expect(deleted.statusCode).toBe(204);
    const rows = await admin`
      select count(*)::int as n from profiles p join users u on u.id = p.user_id where u.email = ${email}`;
    expect(rows[0]?.n).toBe(0);
    const orphans = await admin`
      select count(*)::int as n from profiles where user_id not in (select id from users)`;
    expect(orphans[0]?.n).toBe(0);
  });
});

describe("CV'den profil önerisi (FR-21, ADR-0008)", () => {
  it('CV dosyasını ayrıştırıcıya gönderir, öneri döner ve hiçbir şey kaydetmez', async () => {
    const user = await newUser();
    const cv = await uploadCv(user, 'Data AI');
    parser.received = [];
    const res = await user.request('POST', '/api/profile/extract', { cvVersionId: cv.id });
    expect(res.statusCode).toBe(200);
    const body = res.json<ProfileDraft>();
    expect(body).toMatchObject({
      method: 'text',
      cvVersionId: cv.id,
      draft: {
        fullName: 'Ayse Yilmaz',
        email: 'ayse@example.com',
        location: 'Istanbul',
        skills: ['Python', 'SQL'],
      },
    });
    expect(parser.received).toHaveLength(1);
    expect(parser.received[0]?.equals(PDF)).toBe(true);
    expect((await user.request('GET', '/api/profile')).json<Profile>().updatedAt).toBeNull();
  });

  it('başkasının CV versiyonu 404 döner; ayrıştırıcıya hiçbir şey gitmez', async () => {
    const owner = await newUser();
    const intruder = await newUser();
    const cv = await uploadCv(owner, 'Gizli CV');
    parser.received = [];
    const res = await intruder.request('POST', '/api/profile/extract', { cvVersionId: cv.id });
    expect(res.statusCode).toBe(404);
    expect(parser.received).toHaveLength(0);
  });

  it('dosyasız versiyon, geçersiz ID ve tanımsız alan reddedilir', async () => {
    const user = await newUser();
    const created = await user.request('POST', '/api/cv-versions', { label: 'Dosyasız' });
    const cv = created.json<CvVersion>();
    const noFile = await user.request('POST', '/api/profile/extract', { cvVersionId: cv.id });
    expect(noFile.statusCode).toBe(404);
    expect(noFile.json()).toMatchObject({ code: 'cv_file_not_found' });
    expect(
      (await user.request('POST', '/api/profile/extract', { cvVersionId: 'abc' })).statusCode,
    ).toBe(400);
    expect(
      (await user.request('POST', '/api/profile/extract', { cvVersionId: cv.id, url: 'x' }))
        .statusCode,
    ).toBe(400);
  });

  it('ayrıştırıcı hatalarını genel mesajla döndürür', async () => {
    const user = await newUser();
    const cv = await uploadCv(user, 'Taranmış');
    try {
      parser.next = () => Promise.resolve({ text: '   ', method: 'ocr' });
      const empty = await user.request('POST', '/api/profile/extract', { cvVersionId: cv.id });
      expect(empty.statusCode).toBe(422);
      expect(empty.json()).toMatchObject({ code: 'cv_unreadable' });

      parser.next = () =>
        Promise.reject(
          new AppError(503, 'CV okuma servisi şu an kullanılamıyor.', 'cv_parser_unavailable'),
        );
      const down = await user.request('POST', '/api/profile/extract', { cvVersionId: cv.id });
      expect(down.statusCode).toBe(503);
      expect(down.json()).toMatchObject({ code: 'cv_parser_unavailable' });
    } finally {
      parser.next = () => Promise.resolve({ text: CV_TEXT, method: 'text' });
    }
  });

  it('CV_PARSER_URL yoksa özellik kapalıdır (503)', async () => {
    const closed = buildApp(testConfig(), {
      db: database.db,
      mailer: testMailer,
      isPwned: null,
      rateLimit: false,
    });
    await closed.ready();
    try {
      const agent = new TestAgent(closed);
      const email = `profil-kapali${String(++counter)}@example.com`;
      await agent.register(email, PASSWORD);
      const cv = await uploadCv(agent, 'CV');
      const res = await agent.request('POST', '/api/profile/extract', { cvVersionId: cv.id });
      expect(res.statusCode).toBe(503);
    } finally {
      await closed.close();
    }
  });
});
