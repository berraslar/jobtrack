import { describe, expect, it } from 'vitest';
import { cvTextToMarkdown } from './cv-to-markdown.js';

// FR-23: PDF metninden Ana CV taslağı.

describe('cvTextToMarkdown', () => {
  it('adı başlık, bölümleri alt başlık, madde işaretlerini liste yapar', () => {
    const text = [
      'Ayşe Yılmaz',
      'Veri Bilimci',
      'ayse@example.com   |  +90 555 000 00 00',
      '',
      'DENEYİM',
      'Örnek Teknoloji A.Ş. — Veri Bilimci',
      '01/2021 - 06/2024',
      '• SQL ile haftalık satış raporlarını',
      'otomatikleştirdim.',
      '• Python ile talep tahmini modeli kurdum.',
      'Eğitim:',
      'İstanbul Teknik Üniversitesi',
      'PROJELER',
      '- Açık kaynak veri temizleme aracı',
    ].join('\n');

    expect(cvTextToMarkdown(text)).toBe(
      [
        '# Ayşe Yılmaz',
        '',
        'Veri Bilimci · ayse@example.com | +90 555 000 00 00',
        '',
        '## DENEYİM',
        '',
        'Örnek Teknoloji A.Ş. — Veri Bilimci',
        '',
        '01/2021 - 06/2024',
        '',
        '- SQL ile haftalık satış raporlarını otomatikleştirdim.',
        '- Python ile talep tahmini modeli kurdum.',
        '',
        '## Eğitim',
        '',
        'İstanbul Teknik Üniversitesi',
        '',
        '## PROJELER',
        '',
        '- Açık kaynak veri temizleme aracı',
      ].join('\n'),
    );
  });

  it('madde işareti kaybolmuş PDF’lerde girintili satırları madde, kaydırılan satırları devam sayar', () => {
    // Tarayıcıdan "PDF olarak kaydet" ile üretilmiş bir CV'nin pdftotext çıktısı.
    const text = [
      'Deniz Kaya',
      'Yazılım Mühendisi',
      'deniz.kaya@example.com | +90 555 111 22 33',
      '',
      'ÖZET',
      '',
      'Dağıtık sistemler üzerinde altı yıllık deneyime sahip, servisler geliştiren bir',
      'mühendis.',
      '',
      'DENEYIM',
      'Örnek Yazılım A.Ş. — Kıdemli Yazılım Mühendisi',
      '03/2021 – Halen',
      '',
      '      Kafka tabanlı veri hattını tasarladım ve gecikmeyi yüzde otuz azalttım;',
      '      ekipteki üç geliştiriciye mentorluk yaptım.',
      '      PostgreSQL sorgularını iyileştirdim.',
    ].join('\n');

    expect(cvTextToMarkdown(text)).toBe(
      [
        '# Deniz Kaya',
        '',
        'Yazılım Mühendisi · deniz.kaya@example.com | +90 555 111 22 33',
        '',
        '## ÖZET',
        '',
        'Dağıtık sistemler üzerinde altı yıllık deneyime sahip, servisler geliştiren bir mühendis.',
        '',
        '## DENEYIM',
        '',
        'Örnek Yazılım A.Ş. — Kıdemli Yazılım Mühendisi',
        '',
        '03/2021 – Halen',
        '',
        '- Kafka tabanlı veri hattını tasarladım ve gecikmeyi yüzde otuz azalttım; ekipteki üç geliştiriciye mentorluk yaptım.',
        '- PostgreSQL sorgularını iyileştirdim.',
      ].join('\n'),
    );
  });

  it('boş metinden boş taslak çıkar ve Ana CV sınırını aşmaz', () => {
    expect(cvTextToMarkdown('  \n\n ')).toBe('');
    const long = `Ad Soyad\n\nDENEYİM\n${'- uzun bir madde satırı\n'.repeat(3000)}`;
    expect(cvTextToMarkdown(long).length).toBeLessThanOrEqual(30_000);
  });
});
