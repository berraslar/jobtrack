import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { body, ME, mockApi, renderAt, unauthorized } from '../test/utils';
import { en } from './en';
import { tr } from './tr';

const EN_ME = { ...ME, locale: 'en' as const };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('dil seçimi (FR-16)', () => {
  it('girişten önce cihazda saklanır, sayfa dilini değiştirir ve kayıtta hesaba gönderilir', async () => {
    const calls = mockApi({
      'GET /api/auth/me': unauthorized,
      'POST /api/auth/register': () =>
        Response.json(
          { status: 'email_required', expiresInSeconds: 120, resendInSeconds: 60 },
          { status: 202 },
        ),
    });
    renderAt('/kayit');
    await screen.findByRole('heading', { name: 'Hesap oluştur' });
    expect(document.documentElement.lang).toBe('tr');

    fireEvent.change(screen.getByLabelText('Dil'), { target: { value: 'en' } });
    expect(await screen.findByRole('heading', { name: 'Create account' })).toBeDefined();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('jobtrack-locale')).toBe('en');
    // Oturum yokken ayar uç noktası çağrılmaz.
    expect(calls.some((c) => c.key === 'PATCH /api/settings')).toBe(false);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'cok-guvenli-parola-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => {
      expect(body(calls.find((c) => c.key === 'POST /api/auth/register'))).toMatchObject({
        locale: 'en',
      });
    });
  });

  it('oturum açıkken hesabın dili kullanılır; değişiklik hesaba kaydedilir', async () => {
    localStorage.setItem('jobtrack-locale', 'tr');
    const calls = mockApi({
      'GET /api/auth/me': () => Response.json(EN_ME),
      'GET /api/applications': () => Response.json({ applications: [] }),
      'GET /api/cv-versions': () => Response.json({ cvVersions: [] }),
      'PATCH /api/settings': () => Response.json({ followUpDays: 14, locale: 'tr' }),
    });
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Applications' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeDefined();

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'tr' } });
    expect(await screen.findByRole('heading', { name: 'Başvurular' })).toBeDefined();
    await waitFor(() => {
      expect(body(calls.find((c) => c.key === 'PATCH /api/settings'))).toEqual({ locale: 'tr' });
    });
  });

  it('hesaba kaydedilemezse önceki dile döner ve uyarır', async () => {
    mockApi({
      'GET /api/auth/me': () => Response.json(EN_ME),
      'GET /api/applications': () => Response.json({ applications: [] }),
      'GET /api/cv-versions': () => Response.json({ cvVersions: [] }),
      'PATCH /api/settings': () => Response.json({ error: 'x', traceId: 't' }, { status: 500 }),
    });
    renderAt('/');
    await screen.findByRole('heading', { name: 'Applications' });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'tr' } });
    expect((await screen.findByRole('alert')).textContent).toBe(en.language.saveFailed);
    expect(screen.getByRole('heading', { name: 'Applications' })).toBeDefined();
  });
});

describe('İngilizce hata metinleri (FR-16)', () => {
  it('sunucu hatası koduna göre çevrilir', async () => {
    localStorage.setItem('jobtrack-locale', 'en');
    mockApi({
      'GET /api/auth/me': unauthorized,
      'POST /api/auth/login': () =>
        Response.json(
          { error: 'E-posta veya parola hatalı.', code: 'invalid_credentials', traceId: 't' },
          { status: 401 },
        ),
    });
    renderAt('/giris');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'yanlis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Incorrect email or password.');
  });

  it('istemci doğrulaması alan adıyla birlikte çevrilir', async () => {
    localStorage.setItem('jobtrack-locale', 'en');
    mockApi({ 'GET /api/auth/me': unauthorized });
    renderAt('/kayit');
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'gecersiz' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'kisa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeDefined();
    expect(screen.getByText('Password must be at least 12 characters.')).toBeDefined();
  });
});

describe('İngilizce hesap silme (FR-14, FR-16)', () => {
  it('DELETE yazılarak onaylanır; API sözleşmesi değişmez', async () => {
    let deleted = false;
    const calls = mockApi({
      'GET /api/auth/me': () => (deleted ? unauthorized() : Response.json(EN_ME)),
      'GET /api/settings': () => Response.json({ followUpDays: 14, locale: 'en' }),
      'GET /api/auth/sessions': () => Response.json({ sessions: [] }),
      'POST /api/account/deletion-code': () =>
        Response.json({ expiresInSeconds: 120, resendInSeconds: 60 }),
      'DELETE /api/account': () => {
        deleted = true;
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/ayarlar');
    const card = (await screen.findByRole('heading', { name: 'Delete account' })).closest(
      'section',
    );
    const scope = within(card as HTMLElement);
    expect(scope.getByText(/at most 30 more days/)).toBeDefined();
    fireEvent.change(scope.getByLabelText('Password'), { target: { value: 'parola-123456' } });
    fireEvent.change(scope.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.change(scope.getByLabelText('Type DELETE to confirm'), { target: { value: 'SİL' } });
    fireEvent.click(scope.getByRole('button', { name: 'Permanently delete my account' }));
    expect((await scope.findByRole('alert')).textContent).toBe(
      en.settings.deleteAccount.confirmMissing,
    );

    fireEvent.click(scope.getByRole('button', { name: 'Email me a confirmation code' }));
    fireEvent.change(await scope.findByLabelText('Email confirmation code'), {
      target: { value: '654321' },
    });
    fireEvent.change(scope.getByLabelText('Type DELETE to confirm'), {
      target: { value: 'delete' },
    });
    fireEvent.click(scope.getByRole('button', { name: 'Permanently delete my account' }));
    await waitFor(() => {
      expect(body(calls.find((c) => c.key === 'DELETE /api/account'))).toEqual({
        password: 'parola-123456',
        confirm: 'SİL',
        emailCode: '654321',
        code: '123456',
      });
    });
  });
});

describe('çeviri bütünlüğü (FR-16)', () => {
  /** Metin yaprağı yollarını toplar; fonksiyonlar örnek argümanla çağrılır. */
  function leaves(value: unknown, path = ''): Map<string, string> {
    const out = new Map<string, string>();
    if (typeof value === 'string') out.set(path, value);
    else if (typeof value === 'function')
      out.set(path, String((value as (...a: unknown[]) => unknown)(2, 2)));
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        for (const [p, v] of leaves(child, `${path}.${key}`)) out.set(p, v);
      }
    }
    return out;
  }

  it('İngilizce metinlerin hiçbiri boş değil ve Türkçe karakter içermiyor', () => {
    const trLeaves = leaves(tr);
    const enLeaves = leaves(en);
    expect([...enLeaves.keys()].sort()).toEqual([...trLeaves.keys()].sort());
    for (const [path, text] of enLeaves) {
      expect(text.trim(), path).not.toBe('');
      // Dil adları kendi dilinde yazılır ("Türkçe"); onlar hariç.
      if (!path.startsWith('.language.names')) expect(text, path).not.toMatch(/[ğışİĞŞ]/);
    }
  });
});
