import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, expectNoHorizontalScroll } from './helpers';

async function createApplication(page: Page, company: string, position: string) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Yeni başvuru' }).click();
  await page.getByLabel('Şirket *').fill(company);
  await page.getByLabel('Pozisyon *').fill(position);
  await page.getByLabel('Başvuru tarihi').fill('2026-10-01');
  await page.getByLabel('Kaynak').selectOption({ label: 'LinkedIn' });
  await page.getByRole('button', { name: 'Başvuruyu kaydet' }).click();
  await expect(page.getByRole('heading', { name: position })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('başvuru ekleme, etkinlik, aşama değişikliği ve arama (FR-04..07, FR-10)', async ({
  page,
}) => {
  await page.goto('/');
  await expectAccessible(page, 'Boş liste');

  await page.getByRole('link', { name: 'Yeni başvuru' }).click();
  await expectAccessible(page, 'Yeni başvuru formu');
  // Zorunlu alanlar boşken gönderilmez (NFR-09).
  await page.getByRole('button', { name: 'Başvuruyu kaydet' }).click();
  await expect(page.getByText('Şirket adı boş olamaz.')).toBeVisible();

  await createApplication(page, 'Acme Veri', 'Veri Analisti');
  await expect(page.getByText('Başvuruldu').first()).toBeVisible();
  await expectAccessible(page, 'Başvuru detayı');

  // Etkinlik ekle (FR-07).
  await page.getByLabel('Tür').selectOption({ label: 'Telefon' });
  await page.getByLabel('Görüşülen kişi').fill('Ayşe (İK)');
  await page.getByRole('button', { name: 'Etkinlik ekle' }).click();
  await expect(page.getByText('Telefon · Ayşe (İK)')).toBeVisible();

  // Aşama değişikliği geçmişe yazılır (FR-05, FR-06).
  await page.getByLabel('Mevcut aşama').selectOption({ label: 'Teknik mülakat' });
  await expect(
    page.getByRole('listitem').filter({ hasText: /Teknik mülakat.*Başvuruldu/ }),
  ).toBeVisible();

  // Arama (FR-10).
  await page.getByRole('link', { name: 'Başvurulara dön' }).click();
  await page.getByLabel('Ara', { exact: true }).fill('veri');
  await expect(page.getByRole('link', { name: 'Veri Analisti' })).toBeVisible();
  await page.getByLabel('Ara', { exact: true }).fill('olmayan-bir-sey');
  await expect(page.getByText('Filtrelere uyan başvuru yok.')).toBeVisible();
  await expect(page).toHaveURL(/q=olmayan-bir-sey/);
});

test('Kanban: klavyeyle ve sürükle-bırakla taşıma (FR-09, WCAG 2.5.7)', async ({ page }) => {
  await createApplication(page, 'Kanban AŞ', 'Kanban Pozisyonu');
  await page.goto('/?gorunum=kanban');
  await expectAccessible(page, 'Kanban');

  // Sütun adı "Teklif 2" gibi kart sayısını da içerir; ad başı eşleşmesi yeterli.
  const column = (name: string) => page.getByRole('region', { name });
  const card = page.getByRole('listitem').filter({ hasText: 'Kanban Pozisyonu' });
  await expect(
    column('Başvuruldu').getByRole('link', { name: 'Kanban Pozisyonu', exact: true }),
  ).toBeVisible();

  // Klavye: kartın aşama menüsüne sekmeyle gelip ok tuşuyla seç.
  const menu = page.getByLabel('Kanban Pozisyonu başvurusunun aşaması');
  await menu.focus();
  await menu.selectOption('screening');
  await expect(
    column('İlk görüşme').getByRole('link', { name: 'Kanban Pozisyonu', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/İlk görüşme sütununa taşındı/)).toBeAttached();

  // Fare: sürükle-bırak. HTML5 sürükleme olayları gerçek bir DataTransfer ile tetiklenir
  // (Playwright'ın fare simülasyonu yerel sürüklemeyi her ortamda başlatamıyor).
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await card.dispatchEvent('dragstart', { dataTransfer });
  await column('Teklif').dispatchEvent('dragover', { dataTransfer });
  await column('Teklif').dispatchEvent('drop', { dataTransfer });
  await card.dispatchEvent('dragend', { dataTransfer });
  await expect(
    column('Teklif').getByRole('link', { name: 'Kanban Pozisyonu', exact: true }),
  ).toBeVisible();

  // Değişiklik sunucuya kaydedildi.
  await page.reload();
  await expect(
    column('Teklif').getByRole('link', { name: 'Kanban Pozisyonu', exact: true }),
  ).toBeVisible();
});

test('silme onay ister (FR-15)', async ({ page }) => {
  await createApplication(page, 'Silinecek AŞ', 'Silinecek Pozisyon');
  await page.getByRole('button', { name: 'Sil' }).click();
  const dialog = page.getByRole('dialog', { name: 'Başvuru kalıcı olarak silinsin mi?' });
  await expect(dialog).toBeVisible();
  await expectAccessible(page, 'Silme onayı');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Silinecek Pozisyon' })).toBeVisible();

  await page.getByRole('button', { name: 'Sil' }).click();
  await dialog.getByRole('button', { name: 'Kalıcı olarak sil' }).click();
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Silinecek Pozisyon' })).toHaveCount(0);
});

test('koyu tema ve 360 px mobil görünüm (NFR-06, NFR-10)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Başvurular' })).toBeVisible();
  await expectAccessible(page, 'Liste (koyu tema)');
  await page.goto('/?gorunum=kanban');
  await expectAccessible(page, 'Kanban (koyu tema)');

  await page.setViewportSize({ width: 360, height: 740 });
  for (const path of ['/', '/basvurular/yeni', '/sirketler', '/cv', '/ayarlar']) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
});

test('şirketler, CV versiyonları ve ayarlar sayfaları erişilebilir (FR-08, FR-11, FR-13)', async ({
  page,
}) => {
  await page.goto('/cv');
  await page.getByLabel('Etiket').fill('SnA Data AI');
  await page.getByRole('button', { name: 'Dosyasız ekle' }).click();
  await expect(page.getByText('SnA Data AI', { exact: true })).toBeVisible();
  await expectAccessible(page, 'CV versiyonları');

  // Sürükle-bırak: işletim sisteminden dosya sürükleme taklit edilemez; bırakma olayı gerçek
  // bir DataTransfer ve File ile tetiklenir (Kanban testindeki yöntem).
  const pdf = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n';
  const dataTransfer = await page.evaluateHandle((content) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([content], 'Berra_CV_Analytics.pdf', { type: 'application/pdf' }));
    return transfer;
  }, pdf);
  // Sürükleme başlayınca alanın metni değişir; aynı öğeye tutamakla devam edilir.
  const zone = await page.getByText('CV dosyanızı buraya sürükleyip bırakın').elementHandle();
  await zone?.dispatchEvent('dragenter', { dataTransfer });
  await expect(page.getByText('Bırakın, CV eklensin')).toBeVisible();
  await zone?.dispatchEvent('drop', { dataTransfer });
  await expect(page.getByText('“Berra CV Analytics” eklendi.')).toBeVisible();
  await expectAccessible(page, 'CV versiyonları (dosyalı)');

  // Klavye yolu: "Dosya seç" ile dosyasız versiyona dosya eklenir.
  await page
    .getByRole('button', { name: 'SnA Data AI versiyonuna dosya ekle' })
    .locator('xpath=preceding-sibling::input[@type="file"]')
    .setInputFiles({ name: 'sna.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'SnA Data AI dosyasını indir' }).click();
  expect((await download).suggestedFilename()).toBe('sna.pdf');

  await page.goto('/sirketler');
  await expect(page.getByRole('link', { name: /Acme Veri/ })).toBeVisible();
  await expectAccessible(page, 'Şirketler');
  await page.getByRole('link', { name: /Acme Veri/ }).click();
  await expect(page.getByRole('link', { name: 'Veri Analisti' })).toBeVisible();
  await expectAccessible(page, 'Şirket detayı');

  await page.goto('/ayarlar');
  await page.getByLabel('Gün sayısı').fill('7');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Kaydedildi.')).toBeVisible();
  await expectAccessible(page, 'Ayarlar');
});

test('LinkedIn yer imi betiğinin açtığı form önceden dolu gelir; kaydı kullanıcı yapar (FR-22)', async ({
  page,
}) => {
  const params = new URLSearchParams({
    title: 'Yer İmi Pozisyonu',
    company: 'Yer İmi Şirketi',
    location: 'İstanbul, Türkiye',
    url: 'https://www.linkedin.com/jobs/view/4012345678/?trk=public',
    source: 'linkedin',
    appliedAt: '2026-10-14',
  });
  await page.goto(`/basvurular/yeni?${params.toString()}`);
  await expect(page.getByText(/ilan sayfasından dolduruldu/)).toBeVisible();
  await expect(page.getByLabel(/^Pozisyon/)).toHaveValue('Yer İmi Pozisyonu');
  await expect(page.getByLabel('İlan bağlantısı')).toHaveValue(
    'https://www.linkedin.com/jobs/view/4012345678/',
  );
  await expectAccessible(page, 'Önceden dolu yeni başvuru');

  await page.getByRole('button', { name: 'Başvuruyu kaydet' }).click();
  await expect(page.getByRole('heading', { name: 'Yer İmi Pozisyonu' })).toBeVisible();

  // LinkedIn dışı bağlantı forma girmez.
  await page.goto('/basvurular/yeni?url=https%3A%2F%2Fevil.example%2Fjobs%2Fview%2F4012345678%2F');
  await expect(page.getByText(/alınmadı: İlan bağlantısı/)).toBeVisible();
  await expect(page.getByLabel('İlan bağlantısı')).toHaveValue('');
});

test('CV Düzenle: Ana CV, ilan metni ve elle başlatılan sürüm (FR-23, FR-24)', async ({ page }) => {
  await createApplication(page, 'Uyarlama Şirketi', 'Uyarlama Pozisyonu');
  await page.getByRole('link', { name: 'CV Düzenle' }).click();
  await expect(page.getByRole('heading', { name: 'CV Düzenle', level: 1 })).toBeVisible();

  await page.getByLabel('Ana CV (Markdown)').fill('# Test Kişi\n\n## Deneyim\n- Python\n- SQL');
  await page.getByRole('button', { name: 'Ana CV’yi kaydet' }).click();
  await expect(page.getByText('Ana CV kaydedildi.')).toBeVisible();

  await page
    .getByLabel('Başvuru', { exact: true })
    .selectOption({ label: 'Uyarlama Şirketi – Uyarlama Pozisyonu' });
  await page.getByLabel('İlan metni').fill('Python ve SQL bilen analist arıyoruz.');
  await page.getByRole('button', { name: 'İlanı kaydet' }).click();
  await expect(page.getByText('İlan metni kaydedildi.')).toBeVisible();

  // Test ortamında yapay zekâ kapalıdır (ADR-0010: varsayılan kapalı).
  await expect(page.getByText(/Yapay zekâ özelliği bu kurulumda kapalı/)).toBeVisible();
  await page.getByRole('button', { name: 'Ana CV’den elle başlat' }).click();
  await page
    .getByLabel('Uyarlanmış CV (düzenlenebilir Markdown)')
    .fill('# Test Kişi\n\n## Deneyim\n- SQL\n- Python');
  await expect(page.getByText('2 satır farklı.')).toBeVisible();
  await expectAccessible(page, 'CV Düzenle');
  await page.getByRole('button', { name: 'Sürüm olarak kaydet' }).click();
  await expect(page.getByText(/tarihli sürüm/)).toBeVisible();

  await page.setViewportSize({ width: 360, height: 740 });
  await expectNoHorizontalScroll(page);
});
