import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { returnPath } from '../../App';
import { application, body, ME, mockApi, renderAt, unauthorized } from '../../test/utils';

// FR-22, ADR-0009: yer imi betiğinin açtığı adresle yeni başvuru formunun önceden dolması.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const baseRoutes = {
  'GET /api/companies': () => Response.json({ companies: [] }),
  'GET /api/cv-versions': () => Response.json({ cvVersions: [] }),
};

const query = new URLSearchParams({
  title: 'Veri Bilimci',
  company: 'Örnek Analitik',
  location: 'İstanbul, Türkiye',
  url: 'https://www.linkedin.com/jobs/view/4012345678/?trk=x',
  source: 'linkedin',
  appliedAt: '2026-10-14',
  yerimi: '2',
}).toString();

const detail = (a: ReturnType<typeof application>) => ({ ...a, stageHistory: [], activities: [] });

const value = (label: string | RegExp) => screen.getByLabelText<HTMLInputElement>(label).value;

describe('yeni başvuru formunun önceden dolması (FR-22)', () => {
  it('parametrelerle dolu açılır; kaydetmeden hiçbir şey göndermez', async () => {
    const calls = mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      ...baseRoutes,
      'POST /api/applications': () => Response.json({ id: 'x' }, { status: 201 }),
    });
    renderAt(`/basvurular/yeni?${query}`);
    expect(await screen.findByText(/ilan sayfasından dolduruldu/)).toBeDefined();
    expect(value(/^Şirket/)).toBe('Örnek Analitik');
    expect(value(/^Pozisyon/)).toBe('Veri Bilimci');
    expect(value('Konum')).toBe('İstanbul, Türkiye');
    expect(value('İlan bağlantısı')).toBe('https://www.linkedin.com/jobs/view/4012345678/');
    expect(value('Kaynak')).toBe('linkedin');
    expect(value('Başvuru tarihi')).toBe('2026-10-14');
    expect(calls.some((c) => c.key === 'POST /api/applications')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kaydet' }));
    await screen.findByText(/ilan sayfasından dolduruldu/);
    await expect.poll(() => calls.find((c) => c.key === 'POST /api/applications')).toBeDefined();
    expect(body(calls.find((c) => c.key === 'POST /api/applications'))).toMatchObject({
      companyName: 'Örnek Analitik',
      positionTitle: 'Veri Bilimci',
      jobUrl: 'https://www.linkedin.com/jobs/view/4012345678/',
      source: 'linkedin',
    });
  });

  it('geçersiz değerleri almaz, hangi alanların alınmadığını söyler', async () => {
    mockApi({ 'GET /api/auth/me': () => Response.json(ME), ...baseRoutes });
    const bad = new URLSearchParams({
      title: '<script>alert(1)</script>',
      company: 'a'.repeat(250),
      url: 'javascript:alert(1)',
    }).toString();
    renderAt(`/basvurular/yeni?${bad}`);
    expect(
      await screen.findByText(
        /Şu bilgiler geçersiz ya da çok uzun olduğu için alınmadı: Şirket, İlan bağlantısı\./,
      ),
    ).toBeDefined();
    // HTML metin olarak alana girer, sayfada çalışmaz.
    expect(value(/^Pozisyon/)).toBe('<script>alert(1)</script>');
    expect(document.querySelector('script')).toBeNull();
    expect(value(/^Şirket/)).toBe('');
    expect(value('İlan bağlantısı')).toBe('');
  });

  it('adres parçasındaki ilan metnini gösterir, adresten siler ve başvuruyla kaydeder', async () => {
    const calls = mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      ...baseRoutes,
      'POST /api/applications': () =>
        Response.json(detail(application({ id: '0199b5a0-0000-7000-8000-000000000042' })), {
          status: 201,
        }),
      'PUT /api/applications/0199b5a0-0000-7000-8000-000000000042/job-description': () =>
        Response.json({ jobDescription: 'düzenlendi' }),
      'GET /api/applications/0199b5a0-0000-7000-8000-000000000042': () =>
        Response.json({}, { status: 404 }),
    });
    const hash = `#ilan=${encodeURIComponent('İş Tanımı\n- Python\n- SQL')}`;
    renderAt(`/basvurular/yeni?${query}${hash}`);
    const job = await screen.findByLabelText<HTMLTextAreaElement>('İlan metni (isteğe bağlı)');
    expect(job.value).toBe('İş Tanımı\n- Python\n- SQL');

    fireEvent.change(job, { target: { value: 'İş Tanımı\n- Python' } });
    fireEvent.click(screen.getByRole('button', { name: 'Başvuruyu kaydet' }));
    await expect.poll(() => calls.find((c) => c.key.endsWith('/job-description'))).toBeDefined();
    expect(body(calls.find((c) => c.key.endsWith('/job-description')))).toEqual({
      jobDescription: 'İş Tanımı\n- Python',
    });
    // Sorgu dizesinde ilan metni yoktur; sunucuya giden hiçbir istekte adres parçası görünmez.
    expect(calls.every((c) => !c.key.includes('ilan='))).toBe(true);
  });

  it('ilan metni kaydedilemezse çift kayıt yerine başvuruya bağlantı gösterir', async () => {
    const calls = mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      ...baseRoutes,
      'POST /api/applications': () =>
        Response.json(detail(application({ id: '0199b5a0-0000-7000-8000-000000000043' })), {
          status: 201,
        }),
      'PUT /api/applications/0199b5a0-0000-7000-8000-000000000043/job-description': () =>
        Response.json({ error: 'x' }, { status: 500 }),
    });
    renderAt(`/basvurular/yeni?${query}#ilan=metin`);
    fireEvent.click(await screen.findByRole('button', { name: 'Başvuruyu kaydet' }));
    expect(await screen.findByText(/ilan metni kaydedilemedi/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Başvuruyu aç' }).getAttribute('href')).toBe(
      '/basvurular/0199b5a0-0000-7000-8000-000000000043',
    );
    expect(screen.queryByRole('button', { name: 'Başvuruyu kaydet' })).toBeNull();
    expect(calls.filter((c) => c.key === 'POST /api/applications')).toHaveLength(1);
  });

  it('eski yer imiyle açılınca yenilemeyi önerir; ilan metni okunamadıysa yapıştırmayı söyler', async () => {
    mockApi({ 'GET /api/auth/me': () => Response.json(ME), ...baseRoutes });
    const old = new URLSearchParams({ title: 'Veri Bilimci', source: 'linkedin' }).toString();
    const view = renderAt(`/basvurular/yeni?${old}`);
    expect(await screen.findByText(/eski bir yer imiyle açıldı/)).toBeDefined();
    expect(screen.queryByText(/ilan metni okunamadı/)).toBeNull();
    view.unmount();

    renderAt(`/basvurular/yeni?${query}`);
    expect(await screen.findByText(/Bu sayfadan ilan metni okunamadı/)).toBeDefined();
    expect(screen.queryByText(/eski bir yer imiyle açıldı/)).toBeNull();
  });

  it('oturum yoksa girişten sonra önceden dolu forma döner', async () => {
    let loggedIn = false;
    mockApi({
      'GET /api/auth/me': () => (loggedIn ? Response.json(ME) : unauthorized()),
      'POST /api/auth/login': () => {
        loggedIn = true;
        return Response.json({ status: 'ok', failedAttemptsSinceLastLogin: 0 });
      },
      ...baseRoutes,
    });
    renderAt(`/basvurular/yeni?${query}#ilan=${encodeURIComponent('Görevler')}`);
    fireEvent.change(await screen.findByLabelText('E-posta'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Parola'), { target: { value: 'dogru-parola-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
    expect(await screen.findByRole('heading', { name: 'Yeni başvuru' })).toBeDefined();
    expect(value(/^Pozisyon/)).toBe('Veri Bilimci');
    expect(value('İlan metni (isteğe bağlı)')).toBe('Görevler');
  });
});

describe('bilinçli çıkış', () => {
  it('çıkıştan sonraki giriş son sayfaya değil ana sayfaya açılır', async () => {
    let loggedIn = true;
    mockApi({
      'GET /api/auth/me': () => (loggedIn ? Response.json(ME) : unauthorized()),
      'POST /api/auth/logout': () => {
        loggedIn = false;
        return new Response(null, { status: 204 });
      },
      'POST /api/auth/login': () => {
        loggedIn = true;
        return Response.json({ status: 'ok', failedAttemptsSinceLastLogin: 0 });
      },
      'GET /api/settings': () => Response.json({ followUpDays: 14, locale: 'tr' }),
      'GET /api/auth/sessions': () => Response.json({ sessions: [] }),
      'GET /api/applications': () => Response.json({ applications: [] }),
      'GET /api/stats': () => Response.json({}, { status: 404 }),
      ...baseRoutes,
    });
    renderAt('/ayarlar');
    fireEvent.click(await screen.findByRole('button', { name: 'Çıkış yap' }));
    fireEvent.change(await screen.findByLabelText('E-posta'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Parola'), { target: { value: 'dogru-parola-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
    expect(await screen.findByRole('heading', { name: 'Başvurular' })).toBeDefined();
  });
});

describe('returnPath (açık yönlendirme koruması)', () => {
  it.each([
    [{ from: '/basvurular/yeni?title=x' }, '/basvurular/yeni?title=x'],
    [{ from: '//evil.com/x' }, '/'],
    [{ from: '/\\evil.com' }, '/'],
    [{ from: 'https://evil.com' }, '/'],
    [{ from: 42 }, '/'],
    [null, '/'],
    [undefined, '/'],
  ])('%j -> %s', (state, expected) => {
    expect(returnPath(state)).toBe(expected);
  });
});
