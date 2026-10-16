import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll } from './helpers';

// Uydurma kişiye ait, metin katmanlı örnek CV (LibreOffice ile üretildi).
// eslint-disable-next-line security/detect-non-literal-fs-filename -- depodaki sabit örnek dosya
const CV = readFileSync(new URL('./fixtures/ornek-cv.pdf', import.meta.url));

test("CV'den doldur: gerçek ayrıştırıcıyla öneri, onay ve kayıt (FR-20, FR-21)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto('/cv');
  const dataTransfer = await page.evaluateHandle(
    (bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([new Uint8Array(bytes)], 'Ornek_CV.pdf', { type: 'application/pdf' }),
      );
      return transfer;
    },
    [...CV],
  );
  await page
    .getByText('CV dosyanızı buraya sürükleyip bırakın')
    .dispatchEvent('drop', { dataTransfer });
  await expect(page.getByText('“Ornek CV” eklendi.')).toBeVisible();

  await page.goto('/profil');
  await expect(page.getByRole('heading', { name: 'Profil', level: 1 })).toBeVisible();
  await expectAccessible(page, 'Profil');
  await page.getByLabel('CV', { exact: true }).selectOption({ label: 'Ornek CV' });
  await page.getByRole('button', { name: 'CV’yi oku' }).click();

  const review = page.getByRole('region', { name: 'Önerileri gözden geçirin' });
  await expect(review).toBeVisible({ timeout: 60_000 });
  await expect(review.getByText('Ayşe Yılmaz')).toBeVisible();
  await expect(review.getByText('Kıdemli Veri Bilimci · Örnek Analitik A.Ş.')).toBeVisible();
  await expectAccessible(page, 'Profil (onay ekranı)');

  // Henüz hiçbir şey kaydedilmedi.
  const before = await page.request.get('/api/profile');
  expect(((await before.json()) as { updatedAt: string | null }).updatedAt).toBeNull();

  await review.getByRole('checkbox', { name: /Yeni yetenek\s*Tableau/ }).uncheck();
  await review.getByRole('button', { name: /öneriyi forma aktar/ }).click();
  await expect(page.getByLabel('Ad soyad')).toHaveValue('Ayşe Yılmaz');
  await expect(page.getByRole('textbox', { name: 'Yetenekler', exact: true })).toHaveValue(
    'Python, SQL, PyTorch',
  );

  await page.getByRole('button', { name: 'Profili kaydet' }).click();
  await expect(page.getByText('Profil kaydedildi.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Ad soyad')).toHaveValue('Ayşe Yılmaz');
  await expect(page.getByRole('heading', { name: 'Deneyim 2' })).toBeVisible();

  await page.setViewportSize({ width: 360, height: 740 });
  await expectNoHorizontalScroll(page);
});

test.describe('tanıtım sayfası', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('oturumsuz ana adreste görünür; erişilebilir; 360 px taşmaz (NFR-06, NFR-10)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Her başvuru, defterde bir satır.' }),
    ).toBeVisible();
    await expectAccessible(page, 'Tanıtım');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expectAccessible(page, 'Tanıtım (koyu tema)');
    await page.setViewportSize({ width: 360, height: 740 });
    await expectNoHorizontalScroll(page);

    await page.getByRole('link', { name: 'Deftere giriş yap' }).first().click();
    await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible();
    // Korumalı diğer adresler doğrudan girişe gider.
    await page.goto('/profil');
    await expect(page).toHaveURL(/\/giris$/);
  });
});
