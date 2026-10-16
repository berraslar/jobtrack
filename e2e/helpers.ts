import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { Secret, TOTP } from 'otpauth';

export const PASSWORD = 'uctan-uca-test-parolasi-2026';

/** NFR-06: WCAG 2.2 AA otomatik kontrolleri; ihlal sayısı sıfır olmalı. */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const violations = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    targets: v.nodes.map((n) => n.target.join(' ')),
  }));
  expect(violations, `${label} sayfasında erişilebilirlik ihlali`).toEqual([]);
}

/** NFR-10: 360 px genişlikte sayfa yatay kaydırma gerektirmemeli. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export function totpCode(secret: string, offsetMs = 0): string {
  return new TOTP({ secret: Secret.fromBase32(secret) }).generate({
    timestamp: Date.now() + offsetMs,
  });
}

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${String(Date.now())}@example.com`;
}

/** Arayüzü kullanmadan, oturumdaki kullanıcıya API ile başvuru ekler (CSRF token'ı /me'den alınır). */
export async function seedApplication(
  page: Page,
  body: { companyName: string; positionTitle: string; appliedAt?: string },
  stage?: string,
): Promise<string> {
  const me = await page.request.get('/api/auth/me');
  const { csrfToken } = (await me.json()) as { csrfToken: string };
  const origin = new URL(
    page.url() === 'about:blank'
      ? (process.env.E2E_BASE_URL ?? 'http://localhost:8081')
      : page.url(),
  ).origin;
  const headers = { 'x-csrf-token': csrfToken, origin };
  const res = await page.request.post('/api/applications', { data: body, headers });
  expect(res.status()).toBe(201);
  const { id } = (await res.json()) as { id: string };
  if (stage) {
    const moved = await page.request.post(`/api/applications/${id}/stage`, {
      data: { stage },
      headers,
    });
    expect(moved.status()).toBe(200);
  }
  return id;
}

/**
 * ADR-0007: test ortamındaki Mailpit'ten bu adrese gelen en yeni kodu okur (konu filtresiyle).
 * Kod e-postası birkaç yüz milisaniye içinde gelir; kısa aralıklarla yoklanır.
 */
export async function emailCodeFor(email: string, subject?: RegExp): Promise<string> {
  const base = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8026';
  for (let attempt = 0; attempt < 30; attempt++) {
    const search = await fetch(
      `${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string; Subject: string }[] };
    const match = messages.find((m) => !subject || subject.test(m.Subject));
    if (match) {
      const message = await fetch(`${base}/api/v1/message/${match.ID}`);
      const { Text } = (await message.json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${email} için e-posta kodu gelmedi`);
}

/** FR-18/FR-19: e-posta kodu adımını tamamlar (Türkçe veya İngilizce arayüz). */
export async function completeEmailStep(page: Page, email: string): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /E-postanızı doğrulayın|Check your email/ }),
  ).toBeVisible();
  const code = await emailCodeFor(email, /doğrulama kodunuz|verification code/i);
  await page.getByLabel(/^(E-posta kodu|Email code)$/).fill(code);
  await page.getByRole('button', { name: /^(Doğrula|Verify)$/ }).click();
}
