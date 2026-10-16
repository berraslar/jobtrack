import { describe, expect, it } from 'vitest';
import { checkFabrication } from './fabrication.js';

// ADR-0010 (7. madde): Ana CV'de olmayan tarih, süre ve şirket adları uyarı olarak döner.

const MASTER = `# Ayşe Yılmaz

## Deneyim
### Veri Bilimci — Örnek Analitik A.Ş. (03/2021 – Halen, 3 yıl)
- Talep tahmini modelleri; 6 ay içinde üretime aldı.
### Veri Analisti @ Mavi Lojistik (Oca 2019 – Şub 2021)
- Raporlama.

## Eğitim
### İstatistik — Orta Doğu Teknik Üniversitesi (2014 – 2018)
`;

const kinds = (output: string, knownCompanies?: string[]) =>
  checkFabrication(output, { masterCv: MASTER, ...(knownCompanies ? { knownCompanies } : {}) }).map(
    (w) => `${w.kind}:${w.text}`,
  );

describe('checkFabrication', () => {
  it('Ana CV’yi yeniden düzenleyen ama uydurmayan çıktıda uyarı vermez', () => {
    const output = `# Ayşe Yılmaz

## Deneyim
### Veri Bilimci — Örnek Analitik A.Ş. (03/2021 – Halen, 3 yıl)
- Talep tahmini modellerini 6 ay içinde üretime aldı.
### Veri Analisti @ Mavi Lojistik (Oca 2019 – Şub 2021)

## Eğitim
### İstatistik — Orta Doğu Teknik Üniversitesi (2014 – 2018)
`;
    expect(kinds(output)).toEqual([]);
  });

  it('Ana CV’de olmayan yılları, ay/yıl tarihlerini ve ay adlı tarihleri işaretler', () => {
    expect(kinds('### Veri Bilimci (04/2020 – Mart 2022), 2012’de başladı')).toEqual([
      'date:04/2020',
      'date:Mart 2022',
      'date:2020',
      'date:2022',
      'date:2012',
    ]);
  });

  it('Ana CV’de olmayan süre ifadelerini işaretler (Türkçe ve İngilizce)', () => {
    expect(kinds('3 yıl deneyim; toplam 5 yıl, 18 months ve 2 weeks; 6 ay')).toEqual([
      'duration:5 yıl',
      'duration:18 months',
      'duration:2 weeks',
    ]);
  });

  it('Ana CV’de olmayan şirket adlarını işaretler: ekli adlar ve başlıktaki ayırıcılar', () => {
    const output = `### Kıdemli Analist — Hayali Holding A.Ş. (2015 – 2017, 2 yıl)
### Danışman @ Gizem Danışmanlık
### Veri Bilimci — Örnek Analitik A.Ş.
- Global Veri Ltd. Şti. ile ortak proje`;
    expect(kinds(output)).toEqual([
      'date:2015',
      'date:2017',
      'duration:2 yıl',
      'company:Hayali Holding A.Ş.',
      'company:Global Veri Ltd. Şti.',
      'company:Gizem Danışmanlık',
    ]);
  });

  it('profildeki deneyim şirketlerini bilinen kabul eder', () => {
    expect(kinds('### Stajyer — Kuzey Yazılım', ['Kuzey Yazılım'])).toEqual([]);
    expect(kinds('### Stajyer — Kuzey Yazılım')).toEqual(['company:Kuzey Yazılım']);
  });

  it('aynı uyarıyı bir kez verir ve sayıyı sınırlar', () => {
    const output = Array.from({ length: 50 }, (_, i) => `${String(1950 + i)} 1950`).join('\n');
    const warnings = checkFabrication(output, { masterCv: MASTER });
    expect(warnings).toHaveLength(30);
    expect(new Set(warnings.map((w) => w.text)).size).toBe(30);
  });

  it('uzun ve patolojik girdide hızlı kalır', () => {
    const evil = `### ${'Aa '.repeat(5000)}— ${'B'.repeat(5000)}\n${'Xy '.repeat(20_000)}`;
    const started = performance.now();
    checkFabrication(evil, { masterCv: MASTER });
    expect(performance.now() - started).toBeLessThan(500);
  });
});
