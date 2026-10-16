/**
 * RFC 4180 CSV. Her alan tırnak içine alınır.
 * A05 / CSV injection: Excel ve benzerleri `= + - @` (ve sekme, satır başı) ile başlayan hücreyi formül
 * olarak çalıştırabilir. Böyle başlayan değerlerin önüne tek tırnak eklenir; değer metin olarak görünür.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const BOM = String.fromCharCode(0xfeff);

export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '""';
  let text = String(value);
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** UTF-8 BOM: Excel Türkçe karakterleri doğru göstersin. Satır sonu CRLF (RFC 4180). */
export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
