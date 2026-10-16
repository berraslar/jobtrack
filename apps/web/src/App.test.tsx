import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME as BASE_ME, body, mockApi, renderAt, unauthorized } from './test/utils';

const ME = { ...BASE_ME, mfaEnabled: false };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('oturum yönlendirmesi', () => {
  it('oturum yoksa korumalı sayfadan girişe yönlendirir', async () => {
    mockApi({ 'GET /api/auth/me': unauthorized });
    renderAt('/ayarlar/guvenlik');
    expect(await screen.findByRole('heading', { name: 'Giriş yap' })).toBeDefined();
  });

  it('oturum yoksa ana adreste tanıtım sayfasını gösterir; uydurma veri işaretlidir', async () => {
    mockApi({ 'GET /api/auth/me': unauthorized });
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Her başvuru, defterde bir satır.' }),
    ).toBeDefined();
    expect(screen.getByText('Örnek defter · uydurma veri')).toBeDefined();
    const login = screen.getAllByRole('link', { name: 'Giriş yap' })[0];
    expect(login?.getAttribute('href')).toBe('/giris');
    expect(screen.queryByRole('button', { name: 'Çıkış yap' })).toBeNull();
  });

  it('oturum varsa ana sayfayı ve MFA uyarısını gösterir', async () => {
    mockApi({ 'GET /api/auth/me': () => Response.json(ME) });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Başvurular' })).toBeDefined();
    expect(screen.getByText(/iki adımlı doğrulama kapalı/)).toBeDefined();
  });
});

describe('giriş formu', () => {
  it('yeni cihazda e-posta kodu adımını gösterir, kodu gönderir ve oturumu açar (FR-19)', async () => {
    let loggedIn = false;
    const calls = mockApi({
      'GET /api/auth/me': () => (loggedIn ? Response.json(ME) : unauthorized()),
      'POST /api/auth/login': () =>
        Response.json({ status: 'email_required', expiresInSeconds: 120, resendInSeconds: 60 }),
      'POST /api/auth/email/verify': () => {
        loggedIn = true;
        return Response.json({ status: 'ok', failedAttemptsSinceLastLogin: 0 });
      },
      'GET /api/applications': () => Response.json({ applications: [] }),
      'GET /api/cv-versions': () => Response.json({ cvVersions: [] }),
    });
    renderAt('/giris');
    fireEvent.change(await screen.findByLabelText('E-posta'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Parola'), { target: { value: 'dogru-parola-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));

    const heading = await screen.findByRole('heading', { name: 'E-postanızı doğrulayın' });
    expect(document.activeElement).toBe(heading);
    // Geri sayım gerçek saatle işler; yük altında bir iki saniye geçmiş olabilir.
    expect(screen.getByText(/Kod (2:00|1:5\d) içinde geçersiz olacak/)).toBeDefined();
    // Yeni kod 60 sn dolmadan istenemez.
    expect(screen.getByRole('button', { name: 'Yeni kod gönder' }).hasAttribute('disabled')).toBe(
      true,
    );

    fireEvent.change(screen.getByLabelText('E-posta kodu'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula' }));
    expect(await screen.findByRole('heading', { name: 'Başvurular' })).toBeDefined();
    expect(body(calls.find((c) => c.key === 'POST /api/auth/email/verify'))).toEqual({
      code: '123456',
    });
  });

  it('alanlar parola yöneticisiyle uyumlu (NFR-08)', async () => {
    mockApi({ 'GET /api/auth/me': unauthorized });
    renderAt('/giris');
    const email = await screen.findByLabelText('E-posta');
    expect(email.getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('Parola').getAttribute('autocomplete')).toBe('current-password');
  });

  it('hatalı girişte sunucunun mesajını gösterir', async () => {
    mockApi({
      'GET /api/auth/me': unauthorized,
      'POST /api/auth/login': () =>
        Response.json({ error: 'E-posta veya parola hatalı.', traceId: 't' }, { status: 401 }),
    });
    renderAt('/giris');
    fireEvent.change(await screen.findByLabelText('E-posta'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Parola'), { target: { value: 'yanlis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));
    expect((await screen.findByRole('alert')).textContent).toBe('E-posta veya parola hatalı.');
  });

  it('MFA gerekiyorsa ikinci adıma geçer ve kodu gönderir', async () => {
    let loggedIn = false;
    const calls = mockApi({
      'GET /api/auth/me': () =>
        loggedIn ? Response.json({ ...ME, mfaEnabled: true }) : unauthorized(),
      'POST /api/auth/login': () => Response.json({ status: 'mfa_required' }),
      'POST /api/auth/mfa/verify': () => {
        loggedIn = true;
        return Response.json({ status: 'ok', failedAttemptsSinceLastLogin: 3 });
      },
    });
    renderAt('/giris');
    fireEvent.change(await screen.findByLabelText('E-posta'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Parola'), { target: { value: 'dogru-parola-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Giriş yap' }));

    const code = await screen.findByLabelText('Doğrulama kodu');
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Doğrula' }));

    expect(await screen.findByText(/3 başarısız giriş denemesi/)).toBeDefined();
    const verify = calls.find((c) => c.key === 'POST /api/auth/mfa/verify');
    expect(JSON.parse(verify?.init?.body as string)).toEqual({ code: '123456' });
  });
});

describe('kayıt formu', () => {
  it('kısa parolayı sunucuya göndermeden reddeder (paylaşılan Zod şeması)', async () => {
    const calls = mockApi({ 'GET /api/auth/me': unauthorized });
    renderAt('/kayit');
    fireEvent.change(await screen.findByLabelText('E-posta'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Parola'), { target: { value: 'kisa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hesap oluştur' }));
    expect(await screen.findByText(/en az 12 karakter olmalı/)).toBeDefined();
    expect(calls.some((c) => c.key === 'POST /api/auth/register')).toBe(false);
  });
});

describe('CSRF (A08)', () => {
  it("durum değiştiren isteklerde /me yanıtındaki token'ı gönderir", async () => {
    const calls = mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      'POST /api/auth/logout': () => new Response(null, { status: 204 }),
    });
    renderAt('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Çıkış yap' }));
    await waitFor(() => {
      expect(calls.some((c) => c.key === 'POST /api/auth/logout')).toBe(true);
    });
    const logout = calls.find((c) => c.key === 'POST /api/auth/logout');
    expect((logout?.init?.headers as Record<string, string>)['x-csrf-token']).toBe('csrf-123');
  });
});

describe('MFA kurulumu (FR-02)', () => {
  it('etkinleştirirken kodla birlikte mevcut parolayı gönderir', async () => {
    const calls = mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      'GET /api/auth/sessions': () => Response.json({ sessions: [] }),
      'POST /api/auth/mfa/setup': () =>
        Response.json({
          otpauthUri: 'otpauth://totp/JobTrack:a?secret=JBSWY3DPEHPK3PXP&issuer=JobTrack',
          qrDataUrl: 'data:image/png;base64,AAAA',
        }),
      'POST /api/auth/mfa/enable': () => Response.json({ recoveryCodes: ['abcde-fghjk'] }),
    });
    renderAt('/ayarlar/guvenlik');
    fireEvent.click(await screen.findByRole('button', { name: 'Kurulumu başlat' }));
    fireEvent.change(await screen.findByLabelText('Doğrulama kodu'), {
      target: { value: '123456' },
    });
    const password = screen.getByLabelText('Mevcut parolanız');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    fireEvent.change(password, { target: { value: 'mevcut-parola-123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Etkinleştir' }));

    expect(await screen.findByText('abcde-fghjk')).toBeDefined();
    const enable = calls.find((c) => c.key === 'POST /api/auth/mfa/enable');
    expect(JSON.parse(enable?.init?.body as string)).toEqual({
      code: '123456',
      password: 'mevcut-parola-123',
    });
  });
});
