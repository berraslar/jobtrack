import { describe, expect, it } from 'vitest';
import {
  jobDescriptionUpdateSchema,
  masterCvUpdateSchema,
  tailorResultSchema,
} from './cv-tailor.js';

describe('Ana CV ve ilan metni şemaları (FR-23)', () => {
  it('Ana CV Markdown boşluklarını korur ve 30.000 karakterle sınırlıdır', () => {
    expect(masterCvUpdateSchema.parse({ markdown: '# Ad\n\n- madde  \n' }).markdown).toBe(
      '# Ad\n\n- madde  \n',
    );
    expect(masterCvUpdateSchema.safeParse({ markdown: 'a'.repeat(30_001) }).success).toBe(false);
    expect(masterCvUpdateSchema.safeParse({ markdown: 'x', extra: 1 }).success).toBe(false);
  });

  it('boş ilan metni null olur; 20.000 karakter sınırı', () => {
    expect(jobDescriptionUpdateSchema.parse({ jobDescription: '  \n ' })).toEqual({
      jobDescription: null,
    });
    expect(jobDescriptionUpdateSchema.parse({ jobDescription: null })).toEqual({
      jobDescription: null,
    });
    expect(
      jobDescriptionUpdateSchema.safeParse({ jobDescription: 'a'.repeat(20_001) }).success,
    ).toBe(false);
  });
});

describe('yapay zekâ yanıt şeması (FR-24, ADR-0010)', () => {
  const valid = {
    tailoredMarkdown: '# CV',
    matchScore: 80,
    missingKeywords: ['Airflow'],
    changes: ['Python öne alındı.'],
  };

  it('dört alanlı sabit nesneyi kabul eder', () => {
    expect(tailorResultSchema.parse(valid)).toEqual(valid);
  });

  it.each([
    ['skor 0–100 dışı', { ...valid, matchScore: -1 }],
    ['skor tamsayı değil', { ...valid, matchScore: 3.2 }],
    ['skor metin', { ...valid, matchScore: '80' }],
    ['boş CV', { ...valid, tailoredMarkdown: '' }],
    ['tanımsız alan', { ...valid, note: 'x' }],
    ['eksik alan', { tailoredMarkdown: '# CV', matchScore: 1, missingKeywords: [] }],
    ['çok uzun anahtar kelime', { ...valid, missingKeywords: ['x'.repeat(61)] }],
    ['çok fazla değişiklik', { ...valid, changes: Array.from({ length: 21 }, () => 'x') }],
  ])('reddeder: %s', (_label, value) => {
    expect(tailorResultSchema.safeParse(value).success).toBe(false);
  });
});
