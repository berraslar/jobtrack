import type { ReactNode } from 'react';

// FR-24: CV'nin yazdırma (PDF) görünümü için küçük, güvenli bir Markdown okuyucu. HTML üretmez;
// her parça React öğesidir ve React metni kaçışlar (dangerouslySetInnerHTML yok, A05). Bağlantılar
// tıklanabilir yapılmaz, adresiyle birlikte metin olarak yazılır (javascript: adresi riski yok).
// Desteklenenler: başlıklar (#–###), madde işaretli listeler (-, *, +), paragraflar, **kalın**,
// *italik* / _italik_, `kod` ve [metin](adres).

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

export function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    if (list) blocks.push({ kind: 'list', items: list });
    paragraph = [];
    list = null;
  };
  for (const raw of markdown.split('\n')) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    if (line === '') flush();
    else if (heading) {
      flush();
      const level = Math.min(heading[1]?.length ?? 1, 3) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: heading[2] ?? '' });
    } else if (bullet) {
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
        paragraph = [];
      }
      list ??= [];
      list.push(bullet[1] ?? '');
    } else {
      if (list) {
        blocks.push({ kind: 'list', items: list });
        list = null;
      }
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

const INLINE =
  /\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*|_([^_\n]{1,500})_|`([^`\n]{1,500})`|\[([^\]\n]{1,300})\]\(([^)\s]{1,2048})\)/g;

/** Satır içi biçimleri React öğelerine çevirir; geri kalan her şey düz metindir. */
export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const [, bold, italic, italic2, code, linkText, linkUrl] = match;
    if (bold !== undefined) out.push(<strong key={key++}>{bold}</strong>);
    else if (italic !== undefined || italic2 !== undefined)
      out.push(<em key={key++}>{italic ?? italic2}</em>);
    else if (code !== undefined) out.push(<code key={key++}>{code}</code>);
    else if (linkText !== undefined)
      out.push(linkText === linkUrl ? linkText : `${linkText} (${linkUrl ?? ''})`);
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Markdown'ı yazdırılabilir CV öğelerine çevirir. */
export function Markdown({ source }: { source: string }) {
  return (
    <>
      {parseBlocks(source).map((block, i) => {
        if (block.kind === 'heading') {
          const Tag = block.level === 1 ? 'h1' : block.level === 2 ? 'h2' : 'h3';
          return <Tag key={i}>{renderInline(block.text)}</Tag>;
        }
        if (block.kind === 'list') {
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(block.text)}</p>;
      })}
    </>
  );
}
