import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CvVersion } from '@jobtrack/shared';
import { ME, mockApi, renderAt, type Call } from '../../test/utils';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pdf = (name: string, type = 'application/pdf') =>
  new File(['%PDF-1.7\n%%EOF\n'], name, { type });

const version = (overrides: Partial<CvVersion> = {}): CvVersion => ({
  id: '0199b5a0-0000-7000-a000-000000000001',
  label: 'Data AI',
  fileName: 'data-ai.pdf',
  file: { sizeBytes: 250_000, uploadedAt: '2026-10-05T09:00:00.000Z' },
  applicationCount: 2,
  createdAt: '2026-10-01T09:00:00.000Z',
  ...overrides,
});

function setup(list: CvVersion[] = []) {
  return mockApi({
    'GET /api/auth/me': () => Response.json(ME),
    'GET /api/cv-versions': () => Response.json({ cvVersions: list }),
    'POST /api/cv-versions/upload': (init) => {
      const headers = new Headers(init?.headers);
      return Response.json(
        version({
          label: decodeURIComponent(headers.get('x-cv-label') ?? ''),
          fileName: decodeURIComponent(headers.get('x-file-name') ?? ''),
        }),
        { status: 201 },
      );
    },
    'PUT /api/cv-versions/0199b5a0-0000-7000-a000-000000000001/file': () =>
      Response.json(version()),
  });
}

const drop = (target: HTMLElement, files: File[]) => {
  const dataTransfer = { files, types: ['Files'], dropEffect: 'none' };
  fireEvent.dragEnter(target, { dataTransfer });
  fireEvent.dragOver(target, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });
};

const headersOf = (call: Call | undefined) => new Headers(call?.init?.headers);

describe('CV dosyası sürükle-bırak (FR-08)', () => {
  it('bırakılan PDF yeni versiyon olarak yüklenir; etiket dosya adından gelir', async () => {
    const calls = setup();
    renderAt('/cv');
    const zone = await screen.findByText('CV dosyanızı buraya sürükleyip bırakın');
    drop(zone, [pdf('Berra_CV_Data-AI.pdf')]);

    expect(await screen.findByText('“Berra CV Data-AI” eklendi.')).toBeDefined();
    const call = calls.find((c) => c.key === 'POST /api/cv-versions/upload');
    const headers = headersOf(call);
    expect(headers.get('content-type')).toBe('application/pdf');
    expect(headers.get('x-csrf-token')).toBe(ME.csrfToken);
    expect(decodeURIComponent(headers.get('x-cv-label') ?? '')).toBe('Berra CV Data-AI');
    expect(decodeURIComponent(headers.get('x-file-name') ?? '')).toBe('Berra_CV_Data-AI.pdf');
    expect(call?.init?.body).toBeInstanceOf(File);
  });

  it('yazılmış etiketi kullanır; türü boş bildirilen PDF de PDF olarak gönderilir', async () => {
    const calls = setup();
    renderAt('/cv');
    fireEvent.change(await screen.findByLabelText('Etiket'), { target: { value: 'Analytics' } });
    drop(screen.getByText('CV dosyanızı buraya sürükleyip bırakın'), [pdf('cv.pdf', '')]);
    await waitFor(() => {
      const headers = headersOf(calls.find((c) => c.key === 'POST /api/cv-versions/upload'));
      expect(decodeURIComponent(headers.get('x-cv-label') ?? '')).toBe('Analytics');
      expect(headers.get('content-type')).toBe('application/pdf');
    });
  });

  it('PDF olmayan dosyayı ve birden çok dosyayı yüklemeden reddeder', async () => {
    const calls = setup();
    renderAt('/cv');
    const zone = await screen.findByText('CV dosyanızı buraya sürükleyip bırakın');
    drop(zone, [new File(['<html></html>'], 'cv.pdf', { type: 'application/pdf' })]);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Yalnızca PDF dosyası yüklenebilir.',
    );
    drop(zone, [pdf('a.pdf'), pdf('b.pdf')]);
    expect((await screen.findByRole('alert')).textContent).toBe('Tek seferde bir dosya bırakın.');
    expect(calls.some((c) => c.key === 'POST /api/cv-versions/upload')).toBe(false);
  });

  it('klavye yolu: "Dosya seç" ile seçilen dosya da yüklenir (WCAG 2.5.7)', async () => {
    const calls = setup();
    const { container } = renderAt('/cv');
    await screen.findByRole('button', { name: 'Dosya seç' });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(input as HTMLInputElement, { target: { files: [pdf('secilen.pdf')] } });
    await waitFor(() => {
      expect(calls.some((c) => c.key === 'POST /api/cv-versions/upload')).toBe(true);
    });
  });

  it('dosyası olan versiyon indirilebilir; üzerine bırakılan dosya onu değiştirir', async () => {
    const calls = setup([version()]);
    renderAt('/cv');
    const link = await screen.findByRole('link', { name: 'Data AI dosyasını indir' });
    expect(link.getAttribute('href')).toBe(
      '/api/cv-versions/0199b5a0-0000-7000-a000-000000000001/file',
    );
    expect(link.hasAttribute('download')).toBe(true);
    const item = link.closest('li') as HTMLElement;
    expect(within(item).getByText(/data-ai\.pdf · PDF · 244 kB/)).toBeDefined();

    drop(within(item).getByText('Data AI'), [pdf('yeni.pdf')]);
    await waitFor(() => {
      const call = calls.find((c) => c.key.startsWith('PUT /api/cv-versions/'));
      expect(decodeURIComponent(headersOf(call).get('x-file-name') ?? '')).toBe('yeni.pdf');
    });
  });
});
