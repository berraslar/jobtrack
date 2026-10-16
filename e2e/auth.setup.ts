import { expect, test as setup } from '@playwright/test';
import { completeEmailStep, PASSWORD, uniqueEmail } from './helpers';

// Başvuru testlerinin kullanacağı hesap. Oturum çerezi dosyaya yazılır ve testler arasında paylaşılır;
// böylece kayıt/giriş hız sınırlarına takılmadan tek kayıtla ilerlenir.
setup('test kullanıcısı oluştur', async ({ page }) => {
  await page.goto('/kayit');
  const email = uniqueEmail('basvuru');
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Parola').fill(PASSWORD);
  await page.getByRole('button', { name: 'Hesap oluştur' }).click();
  await completeEmailStep(page, email);
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();
  await page.context().storageState({ path: 'e2e/.auth/user.json' });
});
