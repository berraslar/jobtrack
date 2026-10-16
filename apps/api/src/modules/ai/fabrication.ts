import type { FabricationWarning } from '@jobtrack/shared';

// ADR-0010 (7. madde): model çıktısı güvenilmeyen girdidir. Geri yerleştirmeden sonra çıktıdaki
// tarihler, süre ifadeleri ve şirket adları Ana CV ile karşılaştırılır; Ana CV'de geçmeyenler
// uyarı olarak döner. Denetim sezgiseldir: amaç kullanıcının gözden kaçırmamasıdır, kanıt değildir.

const MAX_WARNINGS = 30;

// Sabit, sınırlı desenler (kullanıcı girdisinden kurulmaz).
const YEAR = /\b(?:19|20)\d{2}\b/g;
const MONTH_YEAR = /\b(?:0?[1-9]|1[0-2])[./](?:19|20)\d{2}\b/g;
const MONTH_NAMES =
  'ocak|oca|şubat|şub|mart|mar|nisan|nis|mayıs|may|haziran|haz|temmuz|tem|ağustos|ağu|eylül|eyl|ekim|eki|kasım|kas|aralık|ara|january|jan|february|feb|march|april|apr|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec';
const NAMED_MONTH_YEAR = new RegExp(
  `(?<![\\p{L}])(?:${MONTH_NAMES})\\.?\\s(?:19|20)\\d{2}\\b`,
  'giu',
);
const DURATION =
  /(?<![\p{L}\p{N}])\d{1,2}(?:[.,]\d)?\+?\s?(?:yıl|yil|ay|hafta|years?|yrs?|months?|mos?|weeks?)(?![\p{L}])/giu;
/** Şirket ekleri: "A.Ş.", "Ltd. Şti.", "Inc." … Önündeki büyük harfli kelimeler ayrıca toplanır. */
const COMPANY_SUFFIX =
  /(?<!\p{L})(?:A\.Ş\.|AŞ|A\.S\.|Ltd\.?\s?Şti\.?|Ltd\.?|Inc\.?|GmbH|LLC|Corp\.?|Holding|PLC|S\.A\.)(?!\p{L})/gu;
const CAPITALIZED = /^\p{Lu}[\p{L}\p{N}&'’-]{0,40}$/u;
/** Tek kelimelik ekler; adın kendisi sayılmaz. */
const SUFFIX_WORD = /^(?:AŞ|A\.Ş\.|Holding|GmbH|LLC|PLC|Inc\.?|Ltd\.?|Corp\.?|Şti\.?)$/u;

/** Ekle biten şirket adlarını toplar: ekin önündeki en fazla 5 büyük harfli kelime + ek. */
function suffixedCompanies(text: string): string[] {
  const matches = [...text.matchAll(COMPANY_SUFFIX)];
  const names: string[] = [];
  matches.forEach((match, k) => {
    const start = match.index;
    const end = start + match[0].length;
    // "Hayali Holding A.Ş.": "Holding" ardından başka bir ek geliyorsa ad orada bitmez.
    const next = matches[k + 1];
    if (next && text.slice(end, next.index).trim() === '') return;
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const words = text.slice(lineStart, start).trimEnd().split(/\s+/);
    const name: string[] = [];
    for (let i = words.length - 1; i >= 0 && name.length < 5; i--) {
      const word = words.at(i) ?? '';
      if (!CAPITALIZED.test(word)) break;
      name.unshift(word);
    }
    // Ekin kendisi de ad olabilir ("Holding" tek başına değil): en az bir kelime gerekir.
    if (name.some((word) => !SUFFIX_WORD.test(word))) names.push(`${name.join(' ')} ${match[0]}`);
  });
  return names;
}
/** Markdown başlık satırında "Rol — Şirket", "Rol @ Şirket", "Rol at Şirket", "Rol, Şirket". */
// Ayırıcı parantezden önce gelmelidir: "(2019 – 2021)" içindeki tire şirket ayırıcısı değildir.
const HEADING_COMPANY = /^#{1,6}[^\n(]{0,200}?(?:\s[—–-]\s|\s@\s|\sat\s|,\s)([^\n(),|·]{2,80})/gmu;

const normalize = (value: string) =>
  value
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '');

function tokens(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].map((m) => normalize(m[1] ?? m[0])).filter(Boolean);
}

export interface FabricationContext {
  /** Kullanıcının Ana CV'si (özgün, maskesiz). */
  masterCv: string;
  /** Profildeki deneyim kayıtlarının şirketleri (FR-20). */
  knownCompanies?: string[];
}

/** Çıktıda geçen ama Ana CV'de olmayan tarih, süre ve şirket adlarını döndürür. */
export function checkFabrication(
  output: string,
  context: FabricationContext,
): FabricationWarning[] {
  const source = normalize(context.masterCv);
  const sourceDurations = new Set(
    tokens(DURATION, context.masterCv).map((d) => d.replace(/\s/g, '')),
  );
  const known = (context.knownCompanies ?? []).map(normalize).filter(Boolean);
  const warnings: FabricationWarning[] = [];
  const seen = new Set<string>();
  const warn = (kind: FabricationWarning['kind'], text: string) => {
    const key = `${kind}:${normalize(text)}`;
    if (seen.has(key) || warnings.length >= MAX_WARNINGS) return;
    seen.add(key);
    warnings.push({ kind, text: text.trim() });
  };

  for (const pattern of [MONTH_YEAR, NAMED_MONTH_YEAR, YEAR]) {
    for (const match of output.matchAll(pattern)) {
      if (!source.includes(normalize(match[0]))) warn('date', match[0]);
    }
  }

  for (const match of output.matchAll(DURATION)) {
    const compact = normalize(match[0]).replace(/\s/g, '');
    if (!sourceDurations.has(compact)) warn('duration', match[0]);
  }

  const companyCandidates = [
    ...suffixedCompanies(output),
    ...[...output.matchAll(HEADING_COMPANY)].map((m) => m[1] ?? ''),
  ];
  for (const candidate of companyCandidates) {
    const name = normalize(candidate);
    if (name.length < 2) continue;
    const inSource =
      source.includes(name) || known.some((k) => k.includes(name) || name.includes(k));
    if (!inSource) warn('company', candidate);
  }

  return warnings;
}
