// FR-23, FR-24: CV'nin tek A4 sayfaya sığıp sığmadığını ölçer. Ölçüm, PDF ile aynı biçimde
// (.cv-print) ve yazdırma alanının genişliğinde, ekran dışındaki bir öğede yapılır.

/** A4 (210 × 297 mm) eksi @page kenar boşlukları (16 mm üst/alt, 14 mm sol/sağ; index.css). */
export const PAGE_CONTENT_WIDTH_MM = 182;
export const PAGE_CONTENT_HEIGHT_MM = 265;
const MM_TO_PX = 96 / 25.4;
export const PAGE_CONTENT_HEIGHT_PX = PAGE_CONTENT_HEIGHT_MM * MM_TO_PX;

/** Yazı en fazla bu orana kadar küçültülür; daha fazlası okunaklılığı bozar. */
export const MIN_SCALE = 0.85;
const STEP = 0.01;

export interface PageFit {
  /** Yazdırmada uygulanacak yazı ölçeği (1 = olduğu gibi). */
  scale: number;
  /** Ölçek uygulanmadan kaç sayfa tuttuğu. */
  pages: number;
  /** Ölçekle birlikte tek sayfaya sığıyor mu. */
  fits: boolean;
}

/**
 * Öğeyi (genişliği PAGE_CONTENT_WIDTH_MM olan .cv-print) ölçer: tek sayfayı aşıyorsa yazıyı
 * MIN_SCALE'e kadar adım adım küçültüp sığan ilk ölçeği bulur. Ölçülemiyorsa (yükseklik 0,
 * örneğin testlerde) sığıyor sayılır. Öğenin --cv-scale değeri sonuçla bırakılır.
 */
export function fitToOnePage(element: HTMLElement): PageFit {
  element.style.setProperty('--cv-scale', '1');
  const natural = element.scrollHeight;
  const pages = Math.max(1, Math.ceil(natural / PAGE_CONTENT_HEIGHT_PX));
  if (natural <= PAGE_CONTENT_HEIGHT_PX) return { scale: 1, pages, fits: true };
  for (let scale = 1 - STEP; scale >= MIN_SCALE - 1e-9; scale -= STEP) {
    const rounded = Math.round(scale * 100) / 100;
    element.style.setProperty('--cv-scale', String(rounded));
    if (element.scrollHeight <= PAGE_CONTENT_HEIGHT_PX)
      return { scale: rounded, pages, fits: true };
  }
  element.style.setProperty('--cv-scale', '1');
  return { scale: 1, pages, fits: false };
}
