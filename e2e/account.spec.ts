import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  expectAccessible,
  PASSWORD,
  seedApplication,
  uniqueEmail,
  completeEmailStep,
  emailCodeFor,
} from './helpers';

test('pano oranları gösterir ve erişilebilir (FR-12)', async ({ page }) => {
  await seedApplication(
    page,
    { companyName: 'Pano AŞ', positionTitle: 'Pano Pozisyonu', appliedAt: '2026-10-01' },
    'technical',
  );
  await page.goto('/pano');
  const summary = page.getByRole('region', { name: 'Özet' });
  await expect(summary.getByText('Dönüş oranı')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Aşamalara göre başvurular' })).toBeVisible();
  await expectAccessible(page, 'Pano');
  // Tema geçişindeki renk animasyonu ölçülmesin diye sayfa koyu temayla yeniden açılır.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(summary.getByText('Dönüş oranı')).toBeVisible();
  await expectAccessible(page, 'Pano (koyu tema)');
});

test('verileri JSON ve CSV olarak dışa aktarma (FR-14)', async ({ page }) => {
  await seedApplication(page, { companyName: 'Aktarım AŞ', positionTitle: 'Aktarılacak Pozisyon' });
  await page.goto('/ayarlar');

  const [json] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Tümünü indir (JSON)' }).click(),
  ]);
  expect(json.suggestedFilename()).toMatch(/^jobtrack-\d{4}-\d{2}-\d{2}\.json$/);
  // Dosya yolu Playwright'ın indirme dizininden gelir.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const data = JSON.parse(await readFile(await json.path(), 'utf8')) as {
    format: string;
    applications: { positionTitle: string }[];
  };
  expect(data.format).toBe('jobtrack-export');
  expect(data.applications.map((a) => a.positionTitle)).toContain('Aktarılacak Pozisyon');

  const [csv] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Başvuruları indir (CSV)' }).click(),
  ]);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const text = await readFile(await csv.path(), 'utf8');
  expect(text.startsWith('﻿"Şirket","Pozisyon"')).toBe(true);
  expect(text).toContain('"Aktarılacak Pozisyon"');
});

test.describe('hesap silme (FR-14)', () => {
  // Paylaşılan test hesabını silmemek için ayrı bir hesap açılır.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('parola ve onayla hesap kalıcı olarak silinir', async ({ page }) => {
    const email = uniqueEmail('silinecek');
    await page.goto('/kayit');
    await page.getByLabel('E-posta').fill(email);
    await page.getByLabel('Parola').fill(PASSWORD);
    await page.getByRole('button', { name: 'Hesap oluştur' }).click();
    await completeEmailStep(page, email);
    await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();

    await page.goto('/ayarlar');
    const card = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Hesabı sil' }) });
    await card.getByLabel('Parola').fill(PASSWORD);
    await card.getByLabel('Onay için SİL yazın').fill('SİL');
    // Son onay: e-postaya gelen silme kodu (ADR-0007).
    await card.getByRole('button', { name: 'Onay kodunu e-postama gönder' }).click();
    await card
      .getByLabel('E-posta onay kodu')
      .fill(await emailCodeFor(email, /hesap silme onay kodu/));
    await card.getByRole('button', { name: 'Hesabımı kalıcı olarak sil' }).click();
    await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible();

    // Aynı bilgilerle artık giriş yapılamaz.
    await page.getByLabel('E-posta').fill(email);
    await page.getByLabel('Parola').fill(PASSWORD);
    await page.getByRole('button', { name: 'Giriş yap' }).click();
    await expect(page.getByRole('alert')).toHaveText('E-posta veya parola hatalı.');
  });
});
