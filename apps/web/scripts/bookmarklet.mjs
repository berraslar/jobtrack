// FR-22, ADR-0009: yer imi betiğini küçültüp `javascript:` adresine çevirir.
//   node scripts/bookmarklet.mjs          -> src/generated/bookmarklet.ts dosyasını yazar
// Birim testi aynı işlevle üretilen dosyanın kaynakla güncel olduğunu denetler.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

// Paket köküne (apps/web) göre yollar; betik ve testler bu dizinde çalışır.
export const SOURCE = 'bookmarklet/save-job.js';
export const OUTPUT = 'src/generated/bookmarklet.ts';
export const ORIGIN_PLACEHOLDER = '__JOBTRACK_ORIGIN__';

/** Kaynağı küçültür; yer tutucu dokunulmadan kalır. Tüm adres yüzde kodlanır. */
export async function buildBookmarklet(source) {
  const { code } = await transform(source, {
    minify: true,
    target: 'es2020',
    legalComments: 'none',
    charset: 'utf8',
  });
  return `javascript:${encodeURIComponent(code.trim())}`;
}

export function renderModule(href) {
  return [
    '// Bu dosya üretilir; elle düzenlemeyin. Kaynak: bookmarklet/save-job.js (FR-22, ADR-0009).',
    '// Yeniden üretmek için: corepack pnpm --filter @jobtrack/web build:bookmarklet',
    `export const BOOKMARKLET_ORIGIN_PLACEHOLDER = '${ORIGIN_PLACEHOLDER}';`,
    `export const BOOKMARKLET_TEMPLATE = ${JSON.stringify(href)};`,
    '',
  ].join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  // Yollar bu dosyadaki sabitlerdir; kullanıcı girdisi değildir.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const href = await buildBookmarklet(await readFile(resolve(root, SOURCE), 'utf8'));
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await writeFile(resolve(root, OUTPUT), renderModule(href));
  console.log(`${OUTPUT} yazıldı (${String(href.length)} karakter).`);
}
