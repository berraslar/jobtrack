import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { application, body, ME, mockApi, renderAt } from '../../test/utils';

// FR-23, FR-24 (ADR-0010): CV Düzenle sayfası.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const APP = application({ positionTitle: 'Veri Bilimci' });
const MASTER = '# Ayşe Yılmaz\n\n## Deneyim\n- SQL raporları\n- Python modelleri';
const TAILORED = '# Ayşe Yılmaz\n\n## Deneyim\n- Python modelleri\n- SQL raporları';

function routes(aiEnabled: boolean) {
  return {
    'GET /api/auth/me': () => Response.json(ME),
    'GET /api/applications': () => Response.json({ applications: [APP] }),
    'GET /api/master-cv': () =>
      Response.json({ markdown: MASTER, updatedAt: '2026-10-14T08:00:00.000Z' }),
    'GET /api/ai/status': () =>
      Response.json({ enabled: aiEnabled, model: aiEnabled ? 'gemini:gemini-3.8-flash' : null }),
    [`GET /api/applications/${APP.id}/job-description`]: () =>
      Response.json({ jobDescription: 'Python ve SQL bilen veri bilimci' }),
    [`GET /api/applications/${APP.id}/tailored-cvs`]: () => Response.json({ tailoredCvs: [] }),
    [`POST /api/applications/${APP.id}/tailor`]: () =>
      Response.json({
        tailoredMarkdown: TAILORED,
        matchScore: 72,
        missingKeywords: ['Airflow'],
        changes: ['Python deneyimi öne alındı.'],
        warnings: [{ kind: 'company', text: 'Hayali Holding A.Ş.' }],
        maskedCount: 3,
        model: 'gemini:gemini-3.8-flash',
      }),
    [`POST /api/applications/${APP.id}/tailored-cvs`]: () =>
      Response.json(
        {
          id: '0199b5a0-0000-7000-8000-00000000aaaa',
          applicationId: APP.id,
          markdown: TAILORED,
          matchScore: 72,
          missingKeywords: ['Airflow'],
          changes: [],
          model: 'gemini:gemini-3.8-flash',
          createdAt: '2026-10-14T09:00:00.000Z',
          updatedAt: '2026-10-14T09:00:00.000Z',
        },
        { status: 201 },
      ),
  };
}

describe('CV Düzenle (FR-24)', () => {
  it('açık onay olmadan uyarlatmaz; onayla gönderir, uyarıları ve farkı gösterir, sürüm kaydeder', async () => {
    const calls = mockApi(routes(true));
    renderAt(`/cv-duzenle?basvuru=${APP.id}`);

    const run = await screen.findByRole('button', { name: 'İlana göre uyarla' });
    await screen.findByDisplayValue('Python ve SQL bilen veri bilimci');
    expect(run.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Ayrıca maskelenecek ifadeler'), {
      target: { value: 'Moda Cad. No: 12, x' },
    });
    fireEvent.click(screen.getByLabelText(/Google’a \(Gemini\) gönderilmesini onaylıyorum/));
    expect(run.hasAttribute('disabled')).toBe(false);
    fireEvent.click(run);

    expect(await screen.findByText('Kontrol edin: bu ifadeler Ana CV’de geçmiyor')).toBeDefined();
    expect(screen.getByText('Şirket: Hayali Holding A.Ş.')).toBeDefined();
    expect(screen.getByText('%72')).toBeDefined();
    expect(screen.getByText('Gönderimden önce 3 kişisel bilgi maskelendi.')).toBeDefined();
    expect(screen.getByText('Airflow')).toBeDefined();
    expect(body(calls.find((c) => c.key.endsWith('/tailor')))).toEqual({
      consent: true,
      extraMaskTerms: ['Moda Cad. No: 12'],
      onePage: true,
    });

    const diff = screen.getByRole('region', { name: 'Ana CV ile uyarlanmış CV arasındaki fark' });
    expect(within(diff).getByRole('status').textContent).toBe('2 satır farklı.');

    fireEvent.change(screen.getByLabelText('Uyarlanmış CV (düzenlenebilir Markdown)'), {
      target: { value: `${TAILORED}\n- Elle eklenen satır` },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sürüm olarak kaydet' }));
    await vi.waitFor(() => {
      expect(calls.some((c) => c.key.endsWith('/tailored-cvs') && c.key.startsWith('POST'))).toBe(
        true,
      );
    });
    expect(
      body(calls.find((c) => c.key.startsWith('POST') && c.key.endsWith('/tailored-cvs'))),
    ).toMatchObject({
      markdown: `${TAILORED}\n- Elle eklenen satır`,
      matchScore: 72,
      model: 'gemini:gemini-3.8-flash',
    });
  });

  it('Ana CV’yi PDF önizlemesiyle gösterir; düzenlerken önizleme canlı güncellenir ve PDF indirilir', async () => {
    mockApi(routes(false));
    const print = vi.fn();
    vi.stubGlobal('print', print);
    renderAt('/cv-duzenle');

    const preview = await screen.findByRole('region', { name: 'PDF önizlemesi' });
    expect(within(preview).getByRole('heading', { level: 1, name: 'Ayşe Yılmaz' })).toBeDefined();
    expect(within(preview).getByText('SQL raporları')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Ana CV’yi düzenle' }));
    fireEvent.change(screen.getByLabelText('Ana CV (Markdown)'), {
      target: { value: `${MASTER}\n\n## Eğitim\n- İTÜ` },
    });
    const live = screen.getByRole('region', { name: 'PDF önizlemesi' });
    expect(within(live).getByRole('heading', { level: 2, name: 'Eğitim' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Düzenlemeyi kapat' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF indir' }));
    await vi.waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
  });

  it('sürüklenen PDF’ten Ana CV taslağı oluşturur; kaydetmeden önce önizlemede gösterir', async () => {
    const IMPORTED = '# Berra Salar\n\n## Deneyim\n\n- Veri hatları kurdum';
    const calls = mockApi({
      ...routes(false),
      'POST /api/master-cv/import': () => Response.json({ markdown: IMPORTED, method: 'ocr' }),
      'PUT /api/master-cv': () =>
        Response.json({ markdown: IMPORTED, updatedAt: '2026-10-16T09:00:00.000Z' }),
    });
    renderAt('/cv-duzenle');

    const zone = await screen.findByText('PDF CV’nizi buraya sürükleyin');
    const file = new File(['%PDF-1.7\n%%EOF\n'], 'cv.pdf', { type: 'application/pdf' });
    const dataTransfer = { files: [file], types: ['Files'], dropEffect: 'none' };
    fireEvent.dragEnter(zone, { dataTransfer });
    fireEvent.dragOver(zone, { dataTransfer });
    fireEvent.drop(zone, { dataTransfer });

    const editor = await screen.findByLabelText<HTMLTextAreaElement>('Ana CV (Markdown)');
    await vi.waitFor(() => {
      expect(editor.value).toBe(IMPORTED);
    });
    expect(screen.getByText(/taranmış görüntüden okundu \(OCR\)/)).toBeDefined();
    const preview = screen.getByRole('region', { name: 'PDF önizlemesi' });
    expect(within(preview).getByRole('heading', { level: 1, name: 'Berra Salar' })).toBeDefined();
    const upload = calls.find((c) => c.key === 'POST /api/master-cv/import');
    expect(new Headers(upload?.init?.headers).get('content-type')).toBe('application/pdf');
    expect(calls.some((c) => c.key === 'PUT /api/master-cv')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Ana CV’yi kaydet' }));
    await vi.waitFor(() => {
      expect(body(calls.find((c) => c.key === 'PUT /api/master-cv'))).toEqual({
        markdown: IMPORTED,
      });
    });
  });

  it('PDF olmayan dosyayı göndermeden reddeder', async () => {
    const calls = mockApi(routes(false));
    renderAt('/cv-duzenle');
    const zone = await screen.findByText('PDF CV’nizi buraya sürükleyin');
    const dataTransfer = {
      files: [new File(['<html></html>'], 'cv.pdf', { type: 'application/pdf' })],
      types: ['Files'],
      dropEffect: 'none',
    };
    fireEvent.drop(zone, { dataTransfer });
    expect(await screen.findByText('Yalnızca PDF dosyası yüklenebilir.')).toBeDefined();
    expect(calls.some((c) => c.key.endsWith('/master-cv/import'))).toBe(false);
  });

  it('yapay zekâ kapalıyken nasıl açılacağını söyler; Ana CV’den elle sürüm başlatılabilir', async () => {
    const calls = mockApi(routes(false));
    renderAt(`/cv-duzenle?basvuru=${APP.id}`);
    expect(await screen.findByText(/Yapay zekâ özelliği bu kurulumda kapalı/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'İlana göre uyarla' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ana CV’den elle başlat' }));
    const editor = screen.getByLabelText<HTMLTextAreaElement>(
      'Uyarlanmış CV (düzenlenebilir Markdown)',
    );
    expect(editor.value).toBe(MASTER);
    expect(screen.getByText('Fark yok.')).toBeDefined();
    expect(calls.some((c) => c.key.endsWith('/tailor'))).toBe(false);
  });
});
