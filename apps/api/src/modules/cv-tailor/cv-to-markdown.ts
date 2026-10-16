import { MASTER_CV_MAX } from '@jobtrack/shared';
import { clean, headingOf, looksLikeName } from '../profile/cv-parse.js';

// FR-23: PDF'ten okunan CV metnini Ana CV için Markdown taslağına çevirir. Kural tabanlıdır,
// dış servise gitmez; sonuç kullanıcı onaylayıp kaydedene kadar yalnızca taslaktır.

const BULLET = /^[•·*▪●◦‣–-]\s*/u;
/**
 * Word ve tarayıcı çıktısı PDF'lerde madde işareti metne girmez; pdftotext maddeleri girintili
 * satır olarak verir. Girintili satır, bölüm içindeyse madde sayılır.
 */
const INDENTED = /^[\t ]{2,}\S/;
/** Büyük harfli kısa satır (örn. "PROJELER") tanınmayan bölüm başlığı sayılır. */
const SHOUTED = /^[\p{Lu}\d&/ ,.'’()-]{3,40}$/u;
/** Bu işaretlerle biten satırdan sonra gelen satır yeni bir öğedir, satır kaydırması değil. */
const SENTENCE_END = /[.!?]$/;

export function cvTextToMarkdown(text: string): string {
  const lines = text.split('\n').map((raw) => ({
    marked: BULLET.test(raw.trim()),
    indented: INDENTED.test(raw),
    text: clean(raw),
  }));
  const out: string[] = [];
  const header: string[] = [];
  let titled = false;
  let inSection = false;
  /** Önceki satır: "bullet" ya da "text" ise PDF satır kaydırması bir sonrakine eklenebilir. */
  let open: 'bullet' | 'text' | null = null;

  const push = (block: string) => {
    if (out.length && out[out.length - 1] !== '') out.push('');
    out.push(block);
  };
  const flushHeader = () => {
    if (header.length) push(header.join(' · '));
    header.length = 0;
  };

  for (const { marked, indented, text: line } of lines) {
    const bullet = marked || (inSection && indented);
    if (line === '') {
      open = null;
      continue;
    }
    if (!titled) {
      titled = true;
      if (looksLikeName(line) || line.length <= 60) {
        push(`# ${line}`);
        continue;
      }
    }
    const isHeading =
      headingOf(line) !== null || (!bullet && SHOUTED.test(line) && /\p{L}{2}/u.test(line));
    if (isHeading) {
      flushHeader();
      inSection = true;
      open = null;
      push(`## ${line.replace(/[:：]$/, '')}`);
      continue;
    }
    if (!inSection) {
      // Başlıktan önceki satırlar (unvan, iletişim) tek satırda toplanır.
      header.push(line);
      continue;
    }
    // Küçük harfle başlayan satır önceki öğenin devamıdır (PDF satır kaydırması).
    const continues = open !== null && !marked && /^\p{Ll}/u.test(line);
    const last = out.at(-1);
    if (continues && last !== undefined && !SENTENCE_END.test(last)) {
      out.pop();
      out.push(`${last} ${line}`);
    } else if (bullet) {
      if (open !== 'bullet' && last !== undefined && last !== '') out.push('');
      out.push(`- ${line}`);
      open = 'bullet';
    } else {
      push(line);
      open = 'text';
    }
  }
  flushHeader();
  return out.join('\n').trim().slice(0, MASTER_CV_MAX);
}
