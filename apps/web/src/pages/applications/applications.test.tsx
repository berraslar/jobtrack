import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Application } from '@jobtrack/shared';
import { application, body, ME, mockApi, renderAt } from '../../test/utils';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const detail = (a: Application) => ({ ...a, stageHistory: [], activities: [] });

function listRoutes(applications: Application[]) {
  let current = applications;
  return {
    routes: {
      'GET /api/auth/me': () => Response.json(ME),
      'GET /api/cv-versions': () =>
        Response.json({
          cvVersions: [
            {
              id: '0199b5a0-0000-7000-a000-000000000001',
              label: 'SnA Data AI',
              fileName: null,
              file: null,
              applicationCount: 0,
              createdAt: '2026-10-01T09:00:00.000Z',
            },
          ],
        }),
      'GET /api/applications': () => Response.json({ applications: current }),
    },
    set(next: Application[]) {
      current = next;
    },
  };
}

describe('gündem bandı (FR-11, FR-12)', () => {
  it('takip edilecekleri ve sıradaki mülakatı gösterir', async () => {
    const { routes } = listRoutes([]);
    mockApi({
      ...routes,
      'GET /api/stats': () =>
        Response.json({
          byStage: [],
          overall: { applied: 0, responded: 0, interviewed: 0, offered: 0 },
          byCvVersion: [],
          bySource: [],
          weekly: [],
          followUpCount: 2,
          nextInterview: {
            applicationId: '0199b5a0-0000-7000-8000-000000000042',
            companyName: 'Örnek AŞ',
            positionTitle: 'Veri Bilimci',
            occurredAt: '2026-10-14T07:00:00.000Z',
          },
        }),
    });
    renderAt('/');
    const band = await screen.findByRole('region', { name: 'Gündem' });
    expect(within(band).getByRole('link', { name: '2 başvuru' }).getAttribute('href')).toBe(
      '/?followUp=true',
    );
    expect(
      within(band).getByRole('link', { name: 'Örnek AŞ – Veri Bilimci' }).getAttribute('href'),
    ).toBe('/basvurular/0199b5a0-0000-7000-8000-000000000042');
  });
});

describe('başvuru listesi ve filtreler (FR-10)', () => {
  it("URL'deki filtreleri API sorgusuna aktarır", async () => {
    const { routes } = listRoutes([application({ positionTitle: 'Veri Analisti' })]);
    const calls = mockApi(routes);
    renderAt('/?q=veri&source=linkedin&followUp=true');
    expect(await screen.findByRole('link', { name: 'Veri Analisti' })).toBeDefined();
    const request = calls.find((c) => c.key === 'GET /api/applications');
    expect(Object.fromEntries(request?.url.searchParams ?? [])).toEqual({
      q: 'veri',
      source: 'linkedin',
      followUp: 'true',
    });
  });

  it('arama kutusuna yazınca yeni sorgu gönderir', async () => {
    const { routes } = listRoutes([]);
    const calls = mockApi(routes);
    renderAt('/');
    fireEvent.change(await screen.findByLabelText('Ara'), { target: { value: 'acme' } });
    await waitFor(() => {
      expect(calls.some((c) => c.url.searchParams.get('q') === 'acme')).toBe(true);
    });
  });

  it('takip edilecek başvuruyu işaretler', async () => {
    const { routes } = listRoutes([
      application({ positionTitle: 'Bekleyen', needsFollowUp: true }),
    ]);
    mockApi(routes);
    renderAt('/');
    const row = (await screen.findByRole('link', { name: 'Bekleyen' })).closest('tr');
    expect(within(row as HTMLElement).getByText('Takip et')).toBeDefined();
  });
});

describe('Kanban (FR-09, WCAG 2.5.7)', () => {
  it('kartı aşama menüsüyle (klavye/tek tıklama) taşır, sunucuya gönderir ve duyurur', async () => {
    const card = application({ positionTitle: 'Veri Mühendisi', currentStage: 'applied' });
    const list = listRoutes([card]);
    const calls = mockApi({
      ...list.routes,
      [`POST /api/applications/${card.id}/stage`]: () => {
        list.set([{ ...card, currentStage: 'technical' }]);
        return Response.json(detail({ ...card, currentStage: 'technical' }));
      },
    });
    renderAt('/?gorunum=kanban');

    const technical = await screen.findByRole('region', { name: /Teknik mülakat/ });
    expect(within(technical).queryByText('Veri Mühendisi')).toBeNull();

    fireEvent.change(screen.getByLabelText('Veri Mühendisi başvurusunun aşaması'), {
      target: { value: 'technical' },
    });

    // İyimser güncelleme: kart sunucu yanıtı beklenmeden yeni sütunda.
    expect(await within(technical).findByText('Veri Mühendisi')).toBeDefined();
    await waitFor(() => {
      expect(body(calls.find((c) => c.key.endsWith('/stage')))).toEqual({ stage: 'technical' });
    });
    expect(await screen.findByText(/Teknik mülakat sütununa taşındı/)).toBeDefined();
  });

  it('sunucu reddederse kart eski sütuna döner ve hata gösterilir', async () => {
    const card = application({ positionTitle: 'Analist', currentStage: 'applied' });
    const list = listRoutes([card]);
    mockApi({
      ...list.routes,
      [`POST /api/applications/${card.id}/stage`]: () =>
        Response.json({ error: 'Başvuru zaten bu aşamada.', traceId: 't' }, { status: 409 }),
    });
    renderAt('/?gorunum=kanban');
    fireEvent.change(await screen.findByLabelText('Analist başvurusunun aşaması'), {
      target: { value: 'offer' },
    });
    expect((await screen.findByRole('alert')).textContent).toContain('Taşınamadı');
    const applied = screen.getByRole('region', { name: /Başvuruldu/ });
    await waitFor(() => {
      expect(within(applied).queryByText('Analist')).not.toBeNull();
    });
  });
});

describe('yeni başvuru formu (FR-04, NFR-09)', () => {
  const companies = {
    'GET /api/companies': () =>
      Response.json({
        companies: [
          {
            id: '0199b5a0-0000-7000-9000-000000000001',
            name: 'Acme',
            sector: null,
            website: null,
            notes: null,
            applicationCount: 1,
            createdAt: '2026-10-01T09:00:00.000Z',
            updatedAt: '2026-10-01T09:00:00.000Z',
          },
        ],
      }),
  };

  it('şirket ve pozisyon boşsa göndermez, hatayı alanın yanında gösterir', async () => {
    const calls = mockApi({ 'GET /api/auth/me': () => Response.json(ME), ...companies });
    renderAt('/basvurular/yeni');
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu kaydet' }));
    expect(await screen.findByText('Şirket adı boş olamaz.')).toBeDefined();
    expect(screen.getByLabelText('Şirket *').getAttribute('aria-invalid')).toBe('true');
    expect(calls.some((c) => c.key === 'POST /api/applications')).toBe(false);
  });

  async function fillAndSubmit(company: string, position: string) {
    // Şirket önerileri yüklenene kadar bekle (datalist).
    await waitFor(() => {
      expect(document.querySelector('datalist option[value="Acme"]')).not.toBeNull();
    });
    fireEvent.change(screen.getByLabelText('Şirket *'), { target: { value: company } });
    fireEvent.change(screen.getByLabelText('Pozisyon *'), { target: { value: position } });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kaydet' }));
  }

  function createRoutes(created: Application) {
    return {
      'GET /api/auth/me': () => Response.json(ME),
      ...companies,
      'POST /api/applications': () => Response.json(detail(created), { status: 201 }),
      [`GET /api/applications/${created.id}`]: () => Response.json(detail(created)),
    };
  }

  it("kayıtlı şirket adı (büyük/küçük harf farkıyla) yazılırsa şirket ID'siyle gönderir", async () => {
    const created = application({ positionTitle: 'Analist' });
    const calls = mockApi(createRoutes(created));
    renderAt('/basvurular/yeni');
    await fillAndSubmit('ACME', 'Analist');

    // Kayıttan sonra detay sayfasına gidilir.
    expect(await screen.findByRole('heading', { name: 'Analist' })).toBeDefined();
    expect(body(calls.find((c) => c.key === 'POST /api/applications'))).toMatchObject({
      companyId: '0199b5a0-0000-7000-9000-000000000001',
      positionTitle: 'Analist',
      jobUrl: null,
      notes: null,
    });
  });

  it('yeni bir şirket adı yazılırsa adla gönderir (şirket sunucuda oluşturulur)', async () => {
    const created = application({ positionTitle: 'Uzman' });
    const calls = mockApi(createRoutes(created));
    renderAt('/basvurular/yeni');
    await fillAndSubmit('Yeni Şirket', 'Uzman');
    expect(await screen.findByRole('heading', { name: 'Uzman' })).toBeDefined();
    const sent = body(calls.find((c) => c.key === 'POST /api/applications'));
    expect(sent).toMatchObject({ companyName: 'Yeni Şirket', positionTitle: 'Uzman' });
    expect(sent).not.toHaveProperty('companyId');
  });
});

describe('başvuru detayı: silme onayı (FR-15)', () => {
  it('onay vermeden silmez; onaylayınca siler ve listeye döner', async () => {
    const item = application({ positionTitle: 'Silinecek' });
    const list = listRoutes([]);
    const calls = mockApi({
      ...list.routes,
      [`GET /api/applications/${item.id}`]: () => Response.json(detail(item)),
      [`DELETE /api/applications/${item.id}`]: () => new Response(null, { status: 204 }),
    });
    renderAt(`/basvurular/${item.id}`);

    fireEvent.click(await screen.findByRole('button', { name: 'Sil' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Başvuru kalıcı olarak silinsin mi?',
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    expect(calls.some((c) => c.key.startsWith('DELETE'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kalıcı olarak sil' }),
    );
    expect(await screen.findByRole('heading', { name: 'Başvurular' })).toBeDefined();
    expect(calls.some((c) => c.key === `DELETE /api/applications/${item.id}`)).toBe(true);
  });
});
