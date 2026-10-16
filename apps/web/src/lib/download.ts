/** Metni dosya olarak indirir (örn. CV Markdown'ı, FR-24). Sunucuya istek atmaz. */
export function downloadText(fileName: string, text: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/** Dosya adı için güvenli parça: harf, rakam ve tire. */
export const fileSlug = (text: string) =>
  text
    .toLocaleLowerCase('tr')
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'cv';
