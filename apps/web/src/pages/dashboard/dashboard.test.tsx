import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APPLICATION_STAGES, type Stats } from '@jobtrack/shared';
import { routePattern } from '../../lib/vitals';
import { body, ME, mockApi, renderAt } from '../../test/utils';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const stats: Stats = {
  byStage: APPLICATION_STAGES.map((stage) => ({
    stage,
    count: stage === 'applied' ? 4 : stage === 'technical' ? 2 : 0,
  })),
  overall: { applied: 8, responded: 4, interviewed: 2, offered: 1 },
  byCvVersion: [
    {
      cvVersionId: '0199b5a0-0000-7000-a000-000000000001',
      label: 'SnA Data AI',
      applied: 5,
      responded: 4,
      interviewed: 2,
      offered: 1,
    },
    { cvVersionId: null, label: null, applied: 3, responded: 0, interviewed: 0, offered: 0 },
  ],
  bySource: [{ source: 'linkedin', applied: 8, responded: 4, interviewed: 2, offered: 1 }],
  weekly: Array.from({ length: 12 }, (_, i) => ({
    weekStart: `2026-${String(7 + Math.floor(i / 4)).padStart(2, '0')}-${String(1 + (i % 4) * 7).padStart(2, '0')}`,
    count: i === 11 ? 3 : 0,
  })),
  followUpCount: 2,
  nextInterview: null,
};

describe('pano (FR-12)', () => {
  it('oranları, aşama dağılımını ve CV kırılımını gösterir', async () => {
    mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      'GET /api/stats': () => Response.json(stats),
    });
    renderAt('/pano');

    const summary = await screen.findByRole('region', { name: 'Özet' });
    expect(within(summary).getByText('%50')).toBeDefined(); // dönüş 4/8
    expect(within(summary).getByText('%25')).toBeDefined(); // mülakat 2/8
    expect(
      screen.getByRole('link', { name: 'Takip edilecek 2 başvuruyu göster' }).getAttribute('href'),
    ).toBe('/?followUp=true');

    // Çubuklar klavyeyle odaklanabilir ve değerini söyler; ipucu odakla görünür.
    const bar = screen.getByLabelText('Başvuruldu: 4 başvuru');
    fireEvent.focus(bar);
    expect(within(bar).getByRole('tooltip').textContent).toBe('Başvuruldu: 4 başvuru');

    const cvRow = screen.getByRole('row', { name: /SnA Data AI/ });
    expect(within(cvRow).getByText('%80')).toBeDefined(); // 4/5
    expect(screen.getByRole('row', { name: /Belirtilmemiş/ })).toBeDefined();
  });

  it('başvuru yoksa boş durum gösterir', async () => {
    mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      'GET /api/stats': () =>
        Response.json({
          ...stats,
          byStage: stats.byStage.map((s) => ({ ...s, count: 0 })),
          overall: { applied: 0, responded: 0, interviewed: 0, offered: 0 },
          byCvVersion: [],
          bySource: [],
        }),
    });
    renderAt('/pano');
    expect(await screen.findByText(/Pano, başvuru ekledikçe dolacak/)).toBeDefined();
  });
});

describe('hesap silme (FR-14)', () => {
  it('SİL yazılmadan göndermez; MFA açıksa kodu da gönderir ve çıkışa yönlendirir', async () => {
    let deleted = false;
    const calls = mockApi({
      'GET /api/auth/me': () =>
        deleted
          ? Response.json({ error: 'Oturum yok', traceId: 't' }, { status: 401 })
          : Response.json(ME),
      'GET /api/settings': () => Response.json({ followUpDays: 14, locale: 'tr' }),
      'GET /api/auth/sessions': () => Response.json({ sessions: [] }),
      'POST /api/account/deletion-code': () =>
        Response.json({ expiresInSeconds: 120, resendInSeconds: 60 }),
      'DELETE /api/account': () => {
        deleted = true;
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/ayarlar');
    const card = (await screen.findByRole('heading', { name: 'Hesabı sil' })).closest('section');
    const scope = within(card as HTMLElement);
    fireEvent.change(scope.getByLabelText('Parola'), { target: { value: 'parola-123456' } });
    fireEvent.change(scope.getByLabelText('Doğrulama kodu'), { target: { value: '123456' } });
    fireEvent.change(scope.getByLabelText('Onay için SİL yazın'), { target: { value: 'sil mi' } });
    fireEvent.click(scope.getByRole('button', { name: 'Hesabımı kalıcı olarak sil' }));
    expect((await scope.findByRole('alert')).textContent).toContain('SİL yazın');
    expect(calls.some((c) => c.key === 'DELETE /api/account')).toBe(false);

    // Onay kodu istenmeden gönderilmez (ADR-0007).
    fireEvent.change(scope.getByLabelText('Onay için SİL yazın'), { target: { value: 'sil' } });
    fireEvent.click(scope.getByRole('button', { name: 'Hesabımı kalıcı olarak sil' }));
    expect((await scope.findByRole('alert')).textContent).toBe(
      'Önce e-postanıza onay kodu isteyin.',
    );
    fireEvent.click(scope.getByRole('button', { name: 'Onay kodunu e-postama gönder' }));
    fireEvent.change(await scope.findByLabelText('E-posta onay kodu'), {
      target: { value: '654321' },
    });
    fireEvent.click(scope.getByRole('button', { name: 'Hesabımı kalıcı olarak sil' }));
    expect(await screen.findByRole('heading', { name: 'Giriş yap' })).toBeDefined();
    await waitFor(() => {
      expect(body(calls.find((c) => c.key === 'DELETE /api/account'))).toEqual({
        password: 'parola-123456',
        confirm: 'SİL',
        emailCode: '654321',
        code: '123456',
      });
    });
  });

  it('dışa aktarma bağlantıları indirme olarak işaretli', async () => {
    mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      'GET /api/settings': () => Response.json({ followUpDays: 14, locale: 'tr' }),
    });
    renderAt('/ayarlar');
    const json = await screen.findByRole('link', { name: 'Tümünü indir (JSON)' });
    expect(json.getAttribute('href')).toBe('/api/account/export?format=json');
    expect(json.hasAttribute('download')).toBe(true);
  });
});

describe('web-vitals rota kalıbı (NFR-03)', () => {
  it('ID ve özel karakterleri ölçümden çıkarır', () => {
    expect(routePattern('/basvurular/0199b5a0-0000-7000-8000-000000000001')).toBe(
      '/basvurular/:id',
    );
    expect(routePattern('/Sirketler?x=<script>')).toBe('/sirketlerxscript');
  });
});
