import { describe, expect, it } from 'vitest';
import { profileUpdateSchema } from '@jobtrack/shared';
import { parseCvText } from './cv-parse.js';

// Sentetik CV'ler; metinler ayrıştırıcı konteynerin gerçek çıktısıdır (pdftotext ve Tesseract).
const ENGLISH_TEXT_LAYER = `Ayse Yilmaz
Data Scientist
ayse.yilmaz@example.com | +90 532 123 45 67 | Istanbul
linkedin.com/in/ayse-yilmaz-ornek

SUMMARY
Data scientist with 5 years of experience in ML and analytics.

EXPERIENCE
Senior Data Scientist
Ornek Analitik A.S. 03/2021 - Present
Built churn prediction models.
Data Analyst
Demo Finans 2018 - 2021

EDUCATION
Ornek University
BSc Computer Engineering 2014 - 2018

SKILLS
Python, SQL, PyTorch, Tableau

LANGUAGES
Turkish (native), English (C1)`;

const TURKISH_OCR = `Ayşe Yılmaz
Veri Bilimci
ayse.yilmaz@example.com +90 532 123 45 67 istanbul

DENEYİM
Kıdemli Veri Bilimci
Örnek Analitik A.Ş. 03/2021 - Halen

EĞİTİM
Örnek Üniversitesi
Bilgisayar Mühendisliği 2014 - 2018

YETENEKLER
Python, SOL, PyTorch`;

describe('parseCvText (FR-21)', () => {
  it('İngilizce metin katmanından alanları çıkarır', () => {
    const draft = parseCvText(ENGLISH_TEXT_LAYER);
    expect(draft).toMatchObject({
      fullName: 'Ayse Yilmaz',
      headline: 'Data Scientist',
      email: 'ayse.yilmaz@example.com',
      phone: '+90 532 123 45 67',
      location: 'Istanbul',
      linkedin: 'https://linkedin.com/in/ayse-yilmaz-ornek',
      summary: 'Data scientist with 5 years of experience in ML and analytics.',
      skills: ['Python', 'SQL', 'PyTorch', 'Tableau'],
      languages: ['Turkish (native)', 'English (C1)'],
    });
    expect(draft.experience).toEqual([
      {
        title: 'Senior Data Scientist',
        company: 'Ornek Analitik A.S.',
        start: '2021-03',
        end: null,
        current: true,
        description: 'Built churn prediction models.',
      },
      {
        title: 'Data Analyst',
        company: 'Demo Finans',
        start: '2018',
        end: '2021',
        current: false,
        description: null,
      },
    ]);
    expect(draft.education).toEqual([
      {
        school: 'Ornek University',
        degree: 'BSc Computer Engineering',
        start: '2014',
        end: '2018',
      },
    ]);
  });

  it('Türkçe OCR çıktısından alanları çıkarır ("Halen" devam eden iş)', () => {
    const draft = parseCvText(TURKISH_OCR);
    expect(draft).toMatchObject({
      fullName: 'Ayşe Yılmaz',
      headline: 'Veri Bilimci',
      email: 'ayse.yilmaz@example.com',
      skills: ['Python', 'SOL', 'PyTorch'],
    });
    expect(draft.experience[0]).toMatchObject({
      title: 'Kıdemli Veri Bilimci',
      company: 'Örnek Analitik A.Ş.',
      start: '2021-03',
      current: true,
    });
    expect(draft.education[0]).toMatchObject({
      school: 'Örnek Üniversitesi',
      degree: 'Bilgisayar Mühendisliği',
    });
  });

  it('ay adlı tarih aralıklarını çözer', () => {
    const draft = parseCvText(`EXPERIENCE
Backend Developer
Acme Ltd. Oca 2020 – Ağustos 2022
ML Engineer at Demo AI | Sep 2022 - now`);
    expect(draft.experience.map((e) => [e.start, e.end, e.current])).toEqual([
      ['2020-01', '2022-08', false],
      ['2022-09', null, true],
    ]);
    expect(draft.experience[1]).toMatchObject({ title: 'ML Engineer', company: 'Demo AI' });
  });

  it('boş ya da anlamsız metinde boş ama geçerli öneri döner', () => {
    for (const text of ['', '%%%%\n\n12345', 'a'.repeat(10_000)]) {
      const draft = parseCvText(text);
      expect(profileUpdateSchema.safeParse(draft).success).toBe(true);
    }
  });

  it('geçersiz bağlantı ve aşırı uzun değerleri öneriye koymaz (javascript: vb.)', () => {
    const draft = parseCvText(`Jane Doe
www.${'x'.repeat(3000)}.com
SKILLS
${'k'.repeat(80)}, Go`);
    expect(draft.website).toBeNull();
    expect(draft.skills).toEqual(['Go']);
    expect(profileUpdateSchema.safeParse(draft).success).toBe(true);
  });

  it('100 KB patolojik metinde hızlı kalır (ReDoS, ADR-0008)', () => {
    // İstemci metni en fazla 100.000 karaktere kırpar; sınırsız regex niceleyicisi burada saniyeler sürerdi.
    for (const text of [
      `www.${'a'.repeat(99_000)}`,
      'a'.repeat(100_000),
      'a.'.repeat(50_000),
      `x@${'a.'.repeat(49_000)}`,
      '+1'.repeat(50_000),
      'A'.repeat(100_000),
    ]) {
      const started = performance.now();
      parseCvText(text);
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });
});
