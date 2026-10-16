import type { FastifyInstance } from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CV_FILE_MAX_BYTES, type CvVersion } from '@jobtrack/shared';
import { buildApp } from '../../app.js';
import { createDatabase, type Database } from '../../db/client.js';
import {
  startTestDatabase,
  TestAgent,
  testConfig,
  type TestDatabase,
  testMailer,
  lastEmailCode,
} from '../../test/helpers.js';

const PASSWORD = 'cok-guvenli-parola-2026';
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

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

const emails = new WeakMap<TestAgent, string>();

async function newUser(): Promise<TestAgent> {
  const agent = new TestAgent(app);
  const email = `cvdosya${String(++counter)}@example.com`;
  await agent.register(email, PASSWORD);
  emails.set(agent, email);
  return agent;
}

async function deletionCode(agent: TestAgent): Promise<string> {
  await agent.request('POST', '/api/account/deletion-code');
  return lastEmailCode(emails.get(agent) ?? '');
}

const pdfHeaders = (fileName: string, label?: string) => ({
  'content-type': 'application/pdf',
  'x-file-name': encodeURIComponent(fileName),
  ...(label !== undefined ? { 'x-cv-label': encodeURIComponent(label) } : {}),
});

const upload = (agent: TestAgent, label: string, fileName = 'cv.pdf', data = PDF) =>
  agent.request('POST', '/api/cv-versions/upload', data, pdfHeaders(fileName, label));

describe('CV dosyası (FR-08, ADR-0006)', () => {
  it('sürükle-bırak: versiyonu dosyasıyla oluşturur, dosyayı aynen geri verir', async () => {
    const user = await newUser();
    const res = await upload(user, 'Data AI', 'Berra CV – 2026.pdf');
    expect(res.statusCode).toBe(201);
    const cv = res.json<CvVersion>();
    expect(cv).toMatchObject({
      label: 'Data AI',
      fileName: 'Berra CV – 2026.pdf',
      file: { sizeBytes: PDF.length },
    });

    const list = (await user.request('GET', '/api/cv-versions')).json<{
      cvVersions: CvVersion[];
    }>();
    expect(list.cvVersions[0]?.file?.sizeBytes).toBe(PDF.length);

    const download = await user.request('GET', `/api/cv-versions/${cv.id}/file`);
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('application/pdf');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['cache-control']).toBe('no-store');
    expect(download.headers['content-disposition']).toBe(
      `attachment; filename="Berra CV _ 2026.pdf"; filename*=UTF-8''${encodeURIComponent('Berra CV – 2026.pdf')}`,
    );
    expect(download.rawPayload.equals(PDF)).toBe(true);
  });

  it('mevcut versiyonun dosyasını değiştirir ve kaldırır', async () => {
    const user = await newUser();
    const cv = (
      await user.request('POST', '/api/cv-versions', { label: 'Analytics' })
    ).json<CvVersion>();
    expect(cv.file).toBeNull();

    const replaced = Buffer.concat([PDF, Buffer.from('% ikinci\n')]);
    const put = await user.request(
      'PUT',
      `/api/cv-versions/${cv.id}/file`,
      replaced,
      pdfHeaders('yeni.pdf'),
    );
    expect(put.statusCode).toBe(200);
    expect(put.json<CvVersion>()).toMatchObject({
      fileName: 'yeni.pdf',
      file: { sizeBytes: replaced.length },
    });

    expect((await user.request('DELETE', `/api/cv-versions/${cv.id}/file`)).statusCode).toBe(204);
    expect((await user.request('GET', `/api/cv-versions/${cv.id}/file`)).statusCode).toBe(404);
    expect((await user.request('DELETE', `/api/cv-versions/${cv.id}/file`)).statusCode).toBe(404);
  });

  it('PDF olmayan içeriği, yanlış türü, büyük dosyayı ve geçersiz adı reddeder', async () => {
    const user = await newUser();
    // Uzantı ve bildirilen tür PDF ama içerik değil.
    const fake = await upload(user, 'Sahte', 'cv.pdf', Buffer.from('<html>merhaba</html>'));
    expect(fake.statusCode).toBe(400);
    expect(fake.json()).toMatchObject({ code: 'invalid_file_type' });

    const wrongType = await user.request('POST', '/api/cv-versions/upload', PDF, {
      ...pdfHeaders('cv.pdf', 'Tür'),
      'content-type': 'text/html',
    });
    expect(wrongType.statusCode).toBe(415);
    expect(wrongType.json()).toMatchObject({ code: 'unsupported_media_type' });

    const big = Buffer.concat([PDF, Buffer.alloc(CV_FILE_MAX_BYTES)]);
    const tooBig = await upload(user, 'Büyük', 'cv.pdf', big);
    expect(tooBig.statusCode).toBe(413);
    expect(tooBig.json()).toMatchObject({ code: 'payload_too_large' });

    const badEncoding = await user.request('POST', '/api/cv-versions/upload', PDF, {
      ...pdfHeaders('cv.pdf', 'Adsız'),
      'x-file-name': '%E0%A4%A',
    });
    expect(badEncoding.statusCode).toBe(400);
    expect((await upload(user, '', 'cv.pdf')).statusCode).toBe(400);

    // Yol bileşenleri atılır; yalnızca dosya adı kalır.
    const pathy = await upload(user, 'Yol', '../../etc/cv.pdf');
    expect(pathy.json<CvVersion>().fileName).toBe('cv.pdf');

    // Başarısız yüklemeler yarım versiyon bırakmaz.
    const list = (await user.request('GET', '/api/cv-versions')).json<{
      cvVersions: CvVersion[];
    }>();
    expect(list.cvVersions.map((cv) => cv.label)).toEqual(['Yol']);
  });

  it('aynı etiketle ikinci yüklemeyi 409 ile reddeder', async () => {
    const user = await newUser();
    expect((await upload(user, 'Tek')).statusCode).toBe(201);
    const again = await upload(user, 'tek');
    expect(again.statusCode).toBe(409);
    expect(again.json()).toMatchObject({ code: 'cv_version_label_taken' });
  });

  it('başka kullanıcının dosyasına erişim, değiştirme ve silme 404 döner (A01)', async () => {
    const owner = await newUser();
    const cv = (await upload(owner, 'Gizli CV')).json<CvVersion>();
    const intruder = await newUser();

    expect((await intruder.request('GET', `/api/cv-versions/${cv.id}/file`)).statusCode).toBe(404);
    expect(
      (await intruder.request('PUT', `/api/cv-versions/${cv.id}/file`, PDF, pdfHeaders('x.pdf')))
        .statusCode,
    ).toBe(404);
    expect((await intruder.request('DELETE', `/api/cv-versions/${cv.id}/file`)).statusCode).toBe(
      404,
    );
    // Sahibinin dosyası değişmedi.
    const mine = await owner.request('GET', `/api/cv-versions/${cv.id}/file`);
    expect(mine.rawPayload.equals(PDF)).toBe(true);
    // Oturumsuz erişim yok.
    expect(
      (await new TestAgent(app).request('GET', `/api/cv-versions/${cv.id}/file`)).statusCode,
    ).toBe(401);
  });

  it('versiyon ve hesap silinince dosya da silinir (FR-14)', async () => {
    const user = await newUser();
    const first = (await upload(user, 'Bir')).json<CvVersion>();
    await upload(user, 'İki');
    const count = async () =>
      (await admin<{ n: number }[]>`select count(*)::int as n from cv_files`)[0]?.n ?? 0;
    const before = await count();

    expect((await user.request('DELETE', `/api/cv-versions/${first.id}`)).statusCode).toBe(204);
    expect(await count()).toBe(before - 1);

    expect(
      (
        await user.request('DELETE', '/api/account', {
          password: PASSWORD,
          confirm: 'SİL',
          emailCode: await deletionCode(user),
        })
      ).statusCode,
    ).toBe(204);
    expect(await count()).toBe(before - 2);
  });
});
