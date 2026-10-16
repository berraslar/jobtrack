import { expect, test } from '@playwright/test';
import { completeEmailStep, expectAccessible, PASSWORD, totpCode, uniqueEmail } from './helpers';

// Bu dosya kendi hesabını açar; paylaşılan oturumu kullanmaz.
test.use({ storageState: { cookies: [], origins: [] } });

test('kayıt, çıkış, giriş ve iki adımlı doğrulama (FR-01, FR-02)', async ({ page }) => {
  const email = uniqueEmail('kimlik');

  await page.goto('/giris');
  await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible();
  await expectAccessible(page, 'Giriş');

  await page.getByRole('link', { name: 'Kayıt olun' }).click();
  await expectAccessible(page, 'Kayıt');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill(PASSWORD);
  await page.getByRole('button', { name: 'Hesap oluştur' }).click();
  // FR-18: hesap e-postaya gelen kodla doğrulanır.
  await expectAccessible(page, 'E-posta doğrulama');
  await completeEmailStep(page, email);
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();

  // Oturum çerezi güvenli ayarlarla gelir.
  const cookie = (await page.context().cookies()).find((c) => c.name === '__Host-session');
  expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });

  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible();

  // Yanlış parola: genel hata mesajı.
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill('yanlis-parola-0000');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('alert')).toHaveText('E-posta veya parola hatalı.');

  await page.getByLabel('Parola').fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();
  await expect(page.getByText(/1 başarısız giriş denemesi/)).toBeVisible();

  // İki adımlı doğrulamayı aç.
  await page.getByRole('link', { name: 'Ayarlar' }).click();
  await page.getByRole('button', { name: 'Kurulumu başlat' }).click();
  await expect(page.getByRole('img', { name: /QR kodu/ })).toBeVisible();
  await expectAccessible(page, 'MFA kurulumu');
  const secret = (await page.locator('code').textContent()) ?? '';
  // Kurulumda bir önceki 30 saniyelik adımın kodu kullanılır; girişte güncel kod tekrar sayılmasın.
  await page.getByLabel('Doğrulama kodu').fill(totpCode(secret, -30_000));
  await page.getByLabel('Mevcut parolanız').fill(PASSWORD);
  await page.getByRole('button', { name: 'Etkinleştir' }).click();
  await expect(page.getByRole('heading', { name: 'Kurtarma kodlarınız' })).toBeVisible();
  await expect(page.locator('ul.font-mono li')).toHaveCount(10);
  await page.getByRole('button', { name: 'Kaydettim' }).click();

  // MFA ile giriş.
  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'İki adımlı doğrulama' })).toBeFocused();
  await expectAccessible(page, 'MFA doğrulama');
  await page.getByLabel('Doğrulama kodu').fill(totpCode(secret));
  await page.getByRole('button', { name: 'Doğrula' }).click();
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();
});

test('İngilizce arayüz ve dil tercihinin hesaba kaydı (FR-16)', async ({ page }) => {
  await page.goto('/kayit');
  await page.getByLabel('Dil').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expectAccessible(page, 'Kayıt (İngilizce)');

  // Kayıt ekranında seçilen dil hesabın dili olur.
  const email = uniqueEmail('dil');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await completeEmailStep(page, email);
  await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible();
  await expectAccessible(page, 'Başvurular (İngilizce)');

  // Cihazdaki tercih silinse de hesabın dili geri gelir.
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Applications' })).toBeVisible();

  const saved = page.waitForResponse(
    (res) => res.url().endsWith('/api/settings') && res.request().method() === 'PATCH',
  );
  await page.getByLabel('Language').selectOption('tr');
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();
  expect((await saved).status()).toBe(200);
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr');
});

test('yeni cihazdan girişte e-posta kodu istenir; aynı cihaz hatırlanır (FR-19)', async ({
  page,
  browser,
}) => {
  const email = uniqueEmail('cihaz');
  await page.goto('/kayit');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill(PASSWORD);
  await page.getByRole('button', { name: 'Hesap oluştur' }).click();
  await completeEmailStep(page, email);
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();

  // Aynı tarayıcı: çıkış ve yeniden girişte kod istenmez.
  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill(PASSWORD);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();

  // Yeni cihaz (çerezsiz tarayıcı): parola doğru olsa da e-posta kodu istenir.
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const phone = await other.newPage();
  await phone.goto('/giris');
  await phone.getByLabel('E-posta').fill(email);
  await phone.getByLabel('Parola').fill(PASSWORD);
  await phone.getByRole('button', { name: 'Giriş yap' }).click();
  await expectAccessible(phone, 'Yeni cihaz e-posta adımı');
  // Yanlış kod reddedilir, doğru kod oturumu açar.
  await phone.getByLabel('E-posta kodu').fill('000000');
  await phone.getByRole('button', { name: 'Doğrula' }).click();
  await expect(phone.getByRole('alert')).toBeVisible();
  await completeEmailStep(phone, email);
  await expect(phone.getByRole('heading', { name: 'Başvurular' })).toBeVisible();
  await other.close();
});
