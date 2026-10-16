import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME, mockApi, renderAt } from '../../test/utils';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Ayarlar: LinkedIn yer imi (FR-22)', () => {
  it('sürüklenebilir bağlantıya uygulamanın kökenini gömer ve burada çalıştırmaz', async () => {
    mockApi({
      'GET /api/auth/me': () => Response.json(ME),
      'GET /api/settings': () => Response.json({ followUpDays: 14, locale: 'tr' }),
      'GET /api/auth/sessions': () => Response.json({ sessions: [] }),
    });
    renderAt('/ayarlar');
    const link = await screen.findByRole('link', { name: "JobTrack'e kaydet" });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('javascript:')).toBe(true);
    const code = decodeURIComponent(href.slice('javascript:'.length));
    expect(code).toContain(`"${window.location.origin}"`);
    expect(code).toContain('/basvurular/yeni?');
    expect(code).not.toContain('__JOBTRACK_ORIGIN__');

    link.click();
    expect(
      await screen.findByText(/yer imi çubuğuna sürükleyin/, { selector: '[role=status]' }),
    ).toBeDefined();
  });
});
