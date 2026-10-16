import { execFile } from 'node:child_process';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** PDF dosyaları bu baytlarla başlar ("%PDF-"). */
const PDF_SIGNATURE = Buffer.from('%PDF-');
export const MAX_BYTES = 5 * 1024 * 1024;
/** Metin katmanı bundan kısaysa PDF taranmış (görüntü) sayılır ve OCR'a gidilir. */
const MIN_TEXT_CHARS = 40;
const MAX_PAGES = 4;
/** OCR görüntüsünün uzun kenarı (piksel); A4 için ~250 dpi. */
const MAX_PAGE_PIXELS = 3000;
const MAX_OUTPUT = 512 * 1024;

export type ExtractMethod = 'text' | 'ocr';
export interface ExtractResult {
  text: string;
  method: ExtractMethod;
}

export class ExtractError extends Error {
  constructor(
    readonly code: 'not_pdf' | 'too_large' | 'unreadable',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Yardımcı programlar kabuksuz, sabit argüman dizisiyle, zaman aşımı ve çıktı sınırıyla çalışır;
 * ortam değişkeni aktarılmaz. Güvenilmeyen PDF yalnızca geçici bir dizinde bulunur.
 */
async function tool(file: string, args: string[], timeoutMs: number): Promise<string> {
  const { stdout } = await run(file, args, {
    timeout: timeoutMs,
    killSignal: 'SIGKILL',
    maxBuffer: MAX_OUTPUT,
    env: { PATH: '/usr/bin:/bin', OMP_THREAD_LIMIT: '1' },
    encoding: 'utf8',
  });
  return stdout;
}

const normalize = (text: string) =>
  text
    .replace(/\r/g, '')
    // eslint-disable-next-line no-control-regex -- kontrol karakterlerini ayıklamak amaçlanıyor
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export async function extractText(pdf: Buffer): Promise<ExtractResult> {
  if (pdf.length > MAX_BYTES) throw new ExtractError('too_large', 'PDF çok büyük.');
  if (!pdf.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
    throw new ExtractError('not_pdf', 'Dosya PDF değil.');
  }
  const dir = await mkdtemp(join(tmpdir(), 'cv-'));
  try {
    const input = join(dir, 'in.pdf');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp ile açılan geçici dizin
    await writeFile(input, pdf, { mode: 0o600 });

    let text = '';
    try {
      text = normalize(
        await tool(
          '/usr/bin/pdftotext',
          ['-layout', '-enc', 'UTF-8', '-l', String(MAX_PAGES), input, '-'],
          10_000,
        ),
      );
    } catch {
      text = '';
    }
    if (text.replace(/\s/g, '').length >= MIN_TEXT_CHARS) return { text, method: 'text' };

    // Taranmış PDF: sayfaları görüntüye çevir, Tesseract ile Türkçe + İngilizce oku.
    try {
      await tool(
        '/usr/bin/pdftoppm',
        [
          '-r',
          '200',
          // Aşırı büyük sayfa boyutlu PDF'in devasa görüntü üretmesini önler (DoS).
          '-scale-to',
          String(MAX_PAGE_PIXELS),
          '-l',
          String(MAX_PAGES),
          '-png',
          '-gray',
          input,
          join(dir, 'page'),
        ],
        30_000,
      );
    } catch {
      throw new ExtractError('unreadable', 'PDF okunamadı.');
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- mkdtemp ile açılan geçici dizin
    const pages = (await readdir(dir))
      .filter((f) => f.startsWith('page') && f.endsWith('.png'))
      .sort();
    const parts: string[] = [];
    for (const page of pages) {
      parts.push(
        await tool(
          '/usr/bin/tesseract',
          [join(dir, page), '-', '-l', 'tur+eng', '--psm', '4'],
          45_000,
        ),
      );
    }
    const ocr = normalize(parts.join('\n\n'));
    if (!ocr) throw new ExtractError('unreadable', 'PDF okunamadı.');
    return { text: ocr, method: 'ocr' };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
