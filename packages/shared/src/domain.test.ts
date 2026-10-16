import { describe, expect, it } from 'vitest';
import {
  APPLICATION_STAGES,
  applicationCreateSchema,
  applicationUpdateSchema,
  companyCreateSchema,
  DOMAIN_LABELS,
  domainLabels,
  LOCALES,
  settingsUpdateSchema,
} from './domain.js';

describe('applicationCreateSchema (NFR-09)', () => {
  it('yalnızca şirket adı ve pozisyonla geçerlidir', () => {
    expect(
      applicationCreateSchema.safeParse({ companyName: 'Acme', positionTitle: 'Analist' }).success,
    ).toBe(true);
  });

  it('şirket ya da pozisyon eksikse veya boşluksa reddeder', () => {
    expect(applicationCreateSchema.safeParse({ positionTitle: 'Analist' }).success).toBe(false);
    expect(
      applicationCreateSchema.safeParse({ companyName: '   ', positionTitle: 'Analist' }).success,
    ).toBe(false);
  });

  it('formdan gelen boş metni null yapar', () => {
    const parsed = applicationCreateSchema.parse({
      companyName: 'Acme',
      positionTitle: 'Analist',
      location: '',
      jobUrl: '',
    });
    expect(parsed).toMatchObject({ location: null, jobUrl: null });
  });

  it('http(s) dışındaki bağlantıları reddeder', () => {
    for (const jobUrl of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x.example']) {
      expect(
        applicationCreateSchema.safeParse({ companyName: 'A', positionTitle: 'B', jobUrl }).success,
      ).toBe(false);
    }
  });

  it('aşamayı oluşturma veya güncellemede kabul etmez (FR-06)', () => {
    expect(
      applicationCreateSchema.safeParse({
        companyName: 'A',
        positionTitle: 'B',
        currentStage: 'offer',
      }).success,
    ).toBe(false);
    expect(applicationUpdateSchema.safeParse({ currentStage: 'offer' }).success).toBe(false);
  });
});

describe('companyCreateSchema', () => {
  it('adı kırpar', () => {
    expect(companyCreateSchema.parse({ name: '  Acme  ' }).name).toBe('Acme');
  });
});

describe('DOMAIN_LABELS', () => {
  it.each(LOCALES)('%s: her değerin boş olmayan bir etiketi var (FR-05, FR-16)', (locale) => {
    const labels = domainLabels(locale);
    expect(Object.keys(labels.stages).sort()).toEqual([...APPLICATION_STAGES].sort());
    const groups: Record<string, string>[] = [
      labels.stages,
      labels.sources,
      labels.workModes,
      labels.activities,
    ];
    for (const group of groups) {
      expect(Object.values(group).every((label) => label.length > 0)).toBe(true);
    }
  });

  it('domainLabels dile göre doğru kümeyi verir', () => {
    expect(domainLabels('en')).toBe(DOMAIN_LABELS.en);
    expect(domainLabels('tr')).toBe(DOMAIN_LABELS.tr);
  });
});

describe('settingsUpdateSchema (FR-11, FR-16)', () => {
  it('kısmi güncellemeyi kabul eder, boş güncellemeyi ve bilinmeyen dili reddeder', () => {
    expect(settingsUpdateSchema.parse({ locale: 'en' })).toEqual({ locale: 'en' });
    expect(settingsUpdateSchema.parse({ followUpDays: '7' })).toEqual({ followUpDays: 7 });
    expect(settingsUpdateSchema.safeParse({}).success).toBe(false);
    expect(settingsUpdateSchema.safeParse({ locale: 'de' }).success).toBe(false);
  });
});
