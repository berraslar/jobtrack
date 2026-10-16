import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_PROFILE,
  type CvVersion,
  type Profile,
  type ProfileDraft,
  type ProfileUpdate,
} from '@jobtrack/shared';
import { ME, mockApi, renderAt } from '../../test/utils';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CV_ID = '0199b5a0-0000-7000-a000-000000000001';

const cv = (overrides: Partial<CvVersion> = {}): CvVersion => ({
  id: CV_ID,
  label: 'Data AI',
  fileName: 'data-ai.pdf',
  file: { sizeBytes: 250_000, uploadedAt: '2026-10-05T09:00:00.000Z' },
  applicationCount: 0,
  createdAt: '2026-10-01T09:00:00.000Z',
  ...overrides,
});

const SAVED: Profile = {
  ...EMPTY_PROFILE,
  fullName: 'Berra Aslar',
  headline: 'Analist',
  skills: ['SQL'],
  updatedAt: '2026-10-10T09:00:00.000Z',
};

const DRAFT: ProfileDraft = {
  method: 'ocr',
  cvVersionId: CV_ID,
  draft: {
    ...EMPTY_PROFILE,
    fullName: 'Berra Aslar',
    headline: 'Veri Bilimci',
    email: 'berra@example.com',
    skills: ['SQL', 'Python'],
    experience: [
      {
        title: 'Veri Analisti',
        company: 'Örnek A.Ş.',
        start: '2021-03',
        end: null,
        current: true,
        description: null,
      },
    ],
  },
};

function setup(profile: Profile = SAVED, cvs: CvVersion[] = [cv()]) {
  return mockApi({
    'GET /api/auth/me': () => Response.json(ME),
    'GET /api/profile': () => Response.json(profile),
    'GET /api/cv-versions': () => Response.json({ cvVersions: cvs }),
    'PUT /api/profile': (init) => {
      const body = JSON.parse(init?.body as string) as ProfileUpdate;
      return Response.json({ ...body, updatedAt: '2026-10-13T10:00:00.000Z' });
    },
    'POST /api/profile/extract': () => Response.json(DRAFT),
  });
}

/** CV listesi yüklenip düğme etkinleşince tıklar. */
async function readCv() {
  const button = await screen.findByRole('button', { name: 'CV’yi oku' });
  await waitFor(() => {
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  fireEvent.click(button);
}

const putBody = (calls: ReturnType<typeof setup>) => {
  const call = calls.findLast((c) => c.key === 'PUT /api/profile');
  return call ? (JSON.parse(call.init?.body as string) as ProfileUpdate) : undefined;
};

describe('profil (FR-20)', () => {
  it('kayıtlı profili gösterir; değişikliği kaydeder', async () => {
    const calls = setup();
    renderAt('/profil');
    const name = await screen.findByLabelText('Ad soyad');
    expect((name as HTMLInputElement).value).toBe('Berra Aslar');
    const save = screen.getByRole('button', { name: 'Profili kaydet' });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Konum'), { target: { value: 'İstanbul' } });
    fireEvent.change(screen.getByLabelText('Yetenekler'), {
      target: { value: 'SQL, Python ,  , dbt' },
    });
    expect(screen.getByText('Kaydedilmemiş değişiklikler var.')).toBeDefined();
    fireEvent.click(save);

    expect(await screen.findByText('Profil kaydedildi.')).toBeDefined();
    expect(putBody(calls)).toMatchObject({
      fullName: 'Berra Aslar',
      location: 'İstanbul',
      skills: ['SQL', 'Python', 'dbt'],
    });
  });

  it('geçersiz tarih ve bağlantıyı kaydetmeden işaretler', async () => {
    const calls = setup();
    renderAt('/profil');
    await screen.findByLabelText('Ad soyad');
    fireEvent.change(screen.getByLabelText('Web sitesi'), {
      target: { value: 'javascript:alert(1)' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Deneyim ekle' }));
    fireEvent.change(screen.getByLabelText('Başlangıç'), { target: { value: '03/2021' } });
    fireEvent.click(screen.getByRole('button', { name: 'Profili kaydet' }));

    expect(await screen.findByText('Kaydetmeden önce işaretli alanları düzeltin.')).toBeDefined();
    expect(screen.getByLabelText('Web sitesi').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Başlangıç').getAttribute('aria-invalid')).toBe('true');
    expect(calls.some((c) => c.key === 'PUT /api/profile')).toBe(false);
  });
});

describe("CV'den doldur (FR-21)", () => {
  it('öneriler onay ekranında seçilir; forma aktarılır ama kaydedilene kadar gönderilmez', async () => {
    const calls = setup();
    renderAt('/profil');
    await readCv();

    const review = (await screen.findByRole('heading', { name: 'Önerileri gözden geçirin' }))
      .parentElement?.parentElement as HTMLElement;
    expect(within(review).getByText(/OCR ile okundu/)).toBeDefined();
    const extract = calls.find((c) => c.key === 'POST /api/profile/extract');
    expect(JSON.parse(extract?.init?.body as string)).toEqual({ cvVersionId: CV_ID });

    // Aynı ad gösterilmez; dolu unvanı değiştiren öneri işaretsiz, boş alanı dolduran işaretli gelir.
    expect(within(review).queryByText('Berra Aslar')).toBeNull();
    const checkbox = (text: string) =>
      within(review).getByText(text).closest('label')?.querySelector('input') as HTMLInputElement;
    expect(checkbox('Veri Bilimci').checked).toBe(false);
    expect(checkbox('berra@example.com').checked).toBe(true);
    expect(checkbox('Python').checked).toBe(true);
    expect(within(review).queryByText('SQL')).toBeNull();
    expect(checkbox('Veri Analisti · Örnek A.Ş.').checked).toBe(true);
    expect(within(review).getByText('2021-03 – Halen')).toBeDefined();

    fireEvent.click(checkbox('Python'));
    fireEvent.click(within(review).getByRole('button', { name: 'Seçilen 2 öneriyi forma aktar' }));

    expect(await screen.findByText(/2 öneri forma aktarıldı/)).toBeDefined();
    expect(screen.getByLabelText<HTMLInputElement>('E-posta').value).toBe('berra@example.com');
    expect(
      screen.getByLabelText<HTMLInputElement>('Unvan', { selector: 'input[name=headline]' }).value,
    ).toBe('Analist');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Yetenekler').value).toBe('SQL');
    expect(screen.getByRole('heading', { name: 'Deneyim 1' })).toBeDefined();
    expect(calls.some((c) => c.key === 'PUT /api/profile')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Profili kaydet' }));
    await waitFor(() => {
      expect(putBody(calls)).toMatchObject({
        email: 'berra@example.com',
        headline: 'Analist',
        experience: [{ title: 'Veri Analisti', company: 'Örnek A.Ş.', current: true, end: null }],
      });
    });
  });

  it('dosyası olan CV yoksa CV sayfasına yönlendirir', async () => {
    setup(SAVED, [cv({ file: null })]);
    renderAt('/profil');
    expect(await screen.findByText('Dosyası olan bir CV yok.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'CV ekle' }).getAttribute('href')).toBe('/cv');
  });

  it('ayrıştırıcı kapalıysa hatayı gösterir, formu değiştirmez', async () => {
    mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      'GET /api/profile': () => Response.json(SAVED),
      'GET /api/cv-versions': () => Response.json({ cvVersions: [cv()] }),
      'POST /api/profile/extract': () =>
        Response.json(
          {
            error: 'CV okuma servisi şu an kullanılamıyor.',
            code: 'cv_parser_unavailable',
            traceId: 't',
          },
          { status: 503 },
        ),
    });
    renderAt('/profil');
    await readCv();
    expect(await screen.findByText('CV okuma servisi şu an kullanılamıyor.')).toBeDefined();
    expect(screen.queryByText('Önerileri gözden geçirin')).toBeNull();
  });
});
