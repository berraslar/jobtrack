import { AppError } from '../../lib/errors.js';

/** ADR-0008: yalıtılmış ayrıştırıcının döndürdüğü metin. */
export interface ExtractedText {
  text: string;
  method: 'text' | 'ocr';
}
export type TextExtractor = (pdf: Buffer) => Promise<ExtractedText>;

const unavailable = () =>
  new AppError(503, 'CV okuma servisi şu an kullanılamıyor.', 'cv_parser_unavailable');
export const unreadable = () =>
  new AppError(422, 'CV dosyasından metin okunamadı.', 'cv_unreadable');

/** Metin çıktısı üst sınırı; ayrıştırıcı da en fazla 4 sayfa okur. */
const MAX_TEXT_CHARS = 100_000;

/**
 * İç ağdaki ayrıştırıcıya PDF gönderir. Adres yapılandırmadan gelir, kullanıcı girdisinden
 * gelmez (SSRF yüzeyi yok, A01). PDF ve metin loglanmaz.
 */
export function createCvParserClient(baseUrl: string, timeoutMs = 120_000): TextExtractor {
  const url = new URL('/extract', baseUrl);
  return async (pdf) => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/pdf' },
        body: new Uint8Array(pdf),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
    } catch {
      throw unavailable();
    }
    if (res.status === 413 || res.status === 422) throw unreadable();
    if (!res.ok) throw unavailable();
    const body = (await res.json()) as Partial<ExtractedText>;
    if (typeof body.text !== 'string' || (body.method !== 'text' && body.method !== 'ocr')) {
      throw unavailable();
    }
    return { text: body.text.slice(0, MAX_TEXT_CHARS), method: body.method };
  };
}

/** CV_PARSER_URL tanımlı değilse "CV'den doldur" kapalıdır (fail closed). */
export const disabledExtractor: TextExtractor = () => Promise.reject(unavailable());
