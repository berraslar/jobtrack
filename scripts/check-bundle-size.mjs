// NFR-05: ilk yüklemede indirilen JavaScript gzip ile 200 KB'ı geçmemeli.
// index.html'deki modül betiği ve modulepreload bağlantıları "ilk yükleme" sayılır.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 200 * 1024;
const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
// eslint-disable-next-line security/detect-non-literal-fs-filename -- sabit build dizini
const html = readFileSync(join(dist, 'index.html'), 'utf8');

const files = new Set();
for (const match of html.matchAll(/<script[^>]+src="\/([^"]+\.js)"/g)) files.add(match[1]);
for (const match of html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/([^"]+\.js)"/g)) {
  files.add(match[1]);
}
if (files.size === 0) {
  console.error('index.html içinde JavaScript bulunamadı; önce `pnpm build` çalıştırın.');
  process.exit(1);
}

let total = 0;
for (const file of files) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- dosya adları build çıktısından
  const size = gzipSync(readFileSync(join(dist, file))).length;
  total += size;
  console.log(`${(size / 1024).toFixed(1).padStart(7)} KB  ${file}`);
}
const ok = total <= BUDGET_BYTES;
console.log(
  `${(total / 1024).toFixed(1).padStart(7)} KB  toplam (bütçe ${String(BUDGET_BYTES / 1024)} KB) ${ok ? '✓' : '✗ AŞILDI'}`,
);
process.exit(ok ? 0 : 1);
