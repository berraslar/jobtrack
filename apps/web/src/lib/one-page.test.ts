import { describe, expect, it } from 'vitest';
import { fitToOnePage, MIN_SCALE, PAGE_CONTENT_HEIGHT_PX } from './one-page';

// FR-23, FR-24: tek sayfaya sığdırma ölçümü. Yerleşim motoru olmadığı için yükseklik, ölçeğin
// karesiyle küçülen sahte bir öğeyle verilir (yazı küçülünce hem satır hem satır başına harf artar).

function element(naturalHeight: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', {
    get: () => naturalHeight * Number(el.style.getPropertyValue('--cv-scale') || '1') ** 2,
  });
  return el;
}

describe('fitToOnePage', () => {
  it('sığan CV’yi küçültmez', () => {
    const el = element(PAGE_CONTENT_HEIGHT_PX * 0.9);
    expect(fitToOnePage(el)).toEqual({ scale: 1, pages: 1, fits: true });
    expect(el.style.getPropertyValue('--cv-scale')).toBe('1');
  });

  it('biraz taşanı sığan en büyük ölçeğe küçültür', () => {
    const el = element(PAGE_CONTENT_HEIGHT_PX * 1.1);
    const fit = fitToOnePage(el);
    expect(fit).toEqual({ scale: 0.95, pages: 2, fits: true });
    expect(el.scrollHeight).toBeLessThanOrEqual(PAGE_CONTENT_HEIGHT_PX);
    expect(el.style.getPropertyValue('--cv-scale')).toBe('0.95');
  });

  it(`çok uzun CV’yi %${String(MIN_SCALE * 100)} altına küçültmez; sığmadığını ve sayfa sayısını bildirir`, () => {
    const el = element(PAGE_CONTENT_HEIGHT_PX * 2.4);
    expect(fitToOnePage(el)).toEqual({ scale: 1, pages: 3, fits: false });
    expect(el.style.getPropertyValue('--cv-scale')).toBe('1');
  });

  it('ölçülemiyorsa (yükseklik 0) sığıyor sayar', () => {
    expect(fitToOnePage(element(0)).fits).toBe(true);
  });
});
