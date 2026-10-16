import {
  EMPTY_PROFILE,
  profileUpdateSchema,
  type Education,
  type Experience,
  type ProfileUpdate,
} from '@jobtrack/shared';

// FR-21 (ADR-0008): CV metninden profil önerisi. Kural tabanlıdır; hiçbir dış servise gitmez.
// Sonuç yalnızca öneridir: kullanıcı onay ekranında seçer ve düzeltir.

export type Section = 'summary' | 'experience' | 'education' | 'skills' | 'languages' | 'other';

const SECTION_PATTERNS: [Section, RegExp][] = [
  ['summary', /^(özet|hakkımda|profil|kariyer hedefi|summary|profile|about( me)?|objective)$/],
  [
    'experience',
    /^(deneyim|iş deneyimi|deneyimler|tecrübe|iş tecrübesi|experience|work experience|professional experience|employment( history)?)$/,
  ],
  ['education', /^(eğitim|eğitim bilgileri|öğrenim|education)$/],
  [
    'skills',
    /^(yetenekler|beceriler|yetkinlikler|teknik beceriler|teknik yetenekler|skills|technical skills|competencies)$/,
  ],
  ['languages', /^(diller|yabancı diller?|languages)$/],
  [
    'other',
    /^(sertifikalar|sertifikasyonlar|certifications?|projeler|projects|referanslar|references|hobiler|ilgi alanları|interests|ödüller|awards|gönüllülük|volunteer(ing)?|yayınlar|publications|kurslar|courses)$/,
  ],
];

const MONTHS = new Map<string, number>(
  Object.entries({
    oca: 1,
    ocak: 1,
    jan: 1,
    january: 1,
    şub: 2,
    şubat: 2,
    sub: 2,
    feb: 2,
    february: 2,
    mar: 3,
    mart: 3,
    march: 3,
    nis: 4,
    nisan: 4,
    apr: 4,
    april: 4,
    may: 5,
    mayıs: 5,
    haz: 6,
    haziran: 6,
    jun: 6,
    june: 6,
    tem: 7,
    temmuz: 7,
    jul: 7,
    july: 7,
    ağu: 8,
    ağustos: 8,
    agu: 8,
    aug: 8,
    august: 8,
    eyl: 9,
    eylül: 9,
    sep: 9,
    sept: 9,
    september: 9,
    eki: 10,
    ekim: 10,
    oct: 10,
    october: 10,
    kas: 11,
    kasım: 11,
    nov: 11,
    november: 11,
    ara: 12,
    aralık: 12,
    dec: 12,
    december: 12,
  }),
);
const MONTH_WORD = [...MONTHS.keys()].sort((a, b) => b.length - a.length).join('|');
const DATE = `(?:(?:0?[1-9]|1[0-2])[./](?:19|20)\\d{2}|(?:${MONTH_WORD})\\.?\\s+(?:19|20)\\d{2}|(?:19|20)\\d{2})`;
const PRESENT = '(?:halen|devam ediyor|günümüz|şu an|present|current|now|today)';
// eslint-disable-next-line security/detect-non-literal-regexp -- yalnızca bu dosyadaki sabit parçalardan kurulur
const RANGE = new RegExp(`(${DATE})\\s*[-–—]\\s*(${DATE}|${PRESENT})`, 'iu');

// Niceleyiciler sınırlıdır (yerel kısım 64, alan adı 253; RFC 5321): sınırsız `+`, "@" içermeyen
// uzun bir kelimede her konumdan geri izler ve 100 KB metinde saniyeler sürer (ReDoS).
const EMAIL = /[\p{L}0-9._%+-]{1,64}@[\p{L}0-9.-]{1,253}\.[a-z]{2,24}/iu;
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/;
const PHONES = /(?:\+?\d[\d\s().-]{8,}\d)/g;
const URL = /\b(?:https?:\/\/|www\.)[^\s|,;]+|\b(?:linkedin\.com|github\.com)\/[^\s|,;]+/giu;
const SCHOOL =
  /(üniversite|university|college|lise|high school|enstitü|institute|fakülte|faculty|okulu|school|akademi|academy)/iu;

const lower = (s: string) => s.toLocaleLowerCase('tr');
export const clean = (line: string) =>
  line
    .replace(/[\t ]+/g, ' ')
    .replace(/^[•·*▪●◦‣-]\s*/u, '')
    .trim();

export function headingOf(line: string): Section | null {
  const raw = line.replace(/[:：]$/, '').trim();
  if (raw.length > 40) return null;
  // Türkçe yerel küçültme "EXPERIENCE"ı "experıence" yapar; İngilizce başlıklar için yerelsiz biçim de denenir.
  const keys = [lower(raw), raw.toLowerCase()];
  return SECTION_PATTERNS.find(([, pattern]) => keys.some((key) => pattern.test(key)))?.[0] ?? null;
}

function normalizeDate(token: string): string | null {
  const t = lower(token.trim()).replace(/\./g, ' ').replace(/\s+/g, ' ');
  const numeric = /^(\d{1,2})\s*\/\s*(\d{4})$/.exec(t);
  if (numeric) return `${numeric[2] ?? ''}-${(numeric[1] ?? '').padStart(2, '0')}`;
  const named = /^(\p{L}+)\s+(\d{4})$/u.exec(t);
  if (named) {
    const [, word = '', year = ''] = named;
    const month = MONTHS.get(word);
    return month ? `${year}-${String(month).padStart(2, '0')}` : year;
  }
  return /^(\d{4})$/.exec(t)?.[1] ?? null;
}

function parseRange(line: string) {
  const match = RANGE.exec(line);
  if (!match) return null;
  const [whole, from = '', to = ''] = match;
  const present = new RegExp(`^${PRESENT}$`, 'iu').test(to.trim());
  return {
    start: normalizeDate(from),
    end: present ? null : normalizeDate(to),
    current: present,
    rest: clean(
      line
        .replace(whole, '')
        .replace(/[|,–—-]\s*$/, '')
        .replace(/^\s*[|,–—-]/, ''),
    ),
  };
}

const splitList = (lines: string[]) =>
  lines
    .flatMap((line) => line.split(/[,;•·|]/u))
    .map(clean)
    .filter((item) => item.length >= 1 && item.length <= 60);

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = lower(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function looksLikeName(line: string): boolean {
  if (line.length > 60 || /[\d@/]/.test(line)) return false;
  const words = line.split(' ');
  return (
    words.length >= 2 && words.length <= 4 && words.every((w) => /^\p{Lu}[\p{L}'’.-]*$/u.test(w))
  );
}

const httpsUrl = (raw: string) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

function experienceEntries(lines: string[]): Experience[] {
  const dated = lines.map((line, index) => ({ index, range: parseRange(line) }));
  const starts = dated.filter((d) => d.range).map((d) => d.index);
  return starts.map((at, k) => {
    const range = parseRange(lines.at(at) ?? '');
    const previous = at > 0 && !starts.includes(at - 1) ? lines.at(at - 1) : undefined;
    const nextStart = starts[k + 1] ?? lines.length + 1;
    let title = previous ?? null;
    let company = range?.rest ? range.rest : null;
    if (!title && company) {
      const parts = company.split(/\s+(?:at|@|-|–|\|)\s+|,\s*/u);
      if (parts.length >= 2) {
        title = parts[0] ?? null;
        company = parts.slice(1).join(', ');
      }
    }
    // Açıklama: tarih satırından sonraki satırlar, bir sonraki kaydın unvan satırına kadar.
    const description = lines.slice(at + 1, Math.max(at + 1, nextStart - 1)).join('\n');
    return {
      title,
      company,
      start: range?.start ?? null,
      end: range?.end ?? null,
      current: range?.current ?? false,
      description: description || null,
    };
  });
}

function educationEntries(lines: string[]): Education[] {
  const entries: Education[] = [];
  lines.forEach((line, index) => {
    const range = parseRange(line);
    if (!range) return;
    const previous = index > 0 ? lines[index - 1] : undefined;
    const candidates = [previous, range.rest].filter((s): s is string => !!s && !parseRange(s));
    const school = candidates.find((s) => SCHOOL.test(s)) ?? candidates[0] ?? null;
    const degree = candidates.find((s) => s !== school) ?? null;
    entries.push({ school, degree, start: range.start, end: range.end });
  });
  if (entries.length === 0) {
    for (const line of lines.filter((l) => SCHOOL.test(l))) {
      entries.push({ school: line, degree: null, start: null, end: null });
    }
  }
  return entries;
}

export function parseCvText(text: string): ProfileUpdate {
  const lines = text.split('\n').map(clean);
  const sections = new Map<Section | 'header', string[]>([['header', []]]);
  let current: Section | 'header' = 'header';
  for (const line of lines) {
    const heading = headingOf(line);
    if (heading) {
      current = heading;
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (line) sections.get(current)?.push(line);
  }
  const section = (name: Section | 'header') => sections.get(name) ?? [];

  const all = lines.join('\n');
  const email = EMAIL.exec(all)?.[0] ?? null;
  const phone =
    (all.match(PHONES) ?? [])
      .map((p) => p.trim())
      .find((p) => p.replace(/\D/g, '').length >= 10 && !RANGE.test(p)) ?? null;
  const urls = [...all.matchAll(URL)].map((m) => m[0].replace(/[).]+$/, ''));
  const linkedin = urls.find((u) => /linkedin\.com\//i.test(u));
  const github = urls.find((u) => /github\.com\//i.test(u));
  const website = urls.find((u) => !/linkedin\.com|github\.com/i.test(u));

  const header = section('header');
  const nameIndex = header.findIndex(looksLikeName);
  const fullName = nameIndex >= 0 ? (header.at(nameIndex) ?? null) : null;
  const isContact = (line: string) =>
    EMAIL.test(line) || /\d{3}/.test(line) || /linkedin|github|https?:|www\./i.test(line);
  const headline =
    header.slice(nameIndex + 1).find((line) => !isContact(line) && line.length <= 160) ?? null;
  // Konum: iletişim satırındaki e-posta/telefon/bağlantı olmayan kısa parça (örn. "İstanbul").
  const location =
    header
      .filter(isContact)
      .flatMap((line) => line.split(/\s*[|•·]\s*|\s{2,}/u))
      .map((part) => part.replace(EMAIL, '').replace(PHONE, '').trim())
      .find((part) => /^\p{L}[\p{L} ,.'-]{1,60}$/u.test(part) && !/linkedin|github/i.test(part)) ??
    null;

  const draft: ProfileUpdate = {
    ...EMPTY_PROFILE,
    fullName,
    headline,
    email,
    phone,
    location,
    website: website ? httpsUrl(website) : null,
    linkedin: linkedin ? httpsUrl(linkedin) : null,
    github: github ? httpsUrl(github) : null,
    summary: section('summary').join(' ').slice(0, 4000) || null,
    skills: unique(splitList(section('skills'))).slice(0, 100),
    languages: unique(splitList(section('languages'))).slice(0, 20),
    experience: experienceEntries(section('experience')).slice(0, 30),
    education: educationEntries(section('education')).slice(0, 15),
  };
  return sanitize(draft);
}

/** Şemadan geçmeyen alan boşaltılır, geçmeyen liste öğesi atılır; öneri hiçbir zaman geçersiz değildir. */
function sanitize(draft: ProfileUpdate): ProfileUpdate {
  let value: ProfileUpdate = draft;
  for (let round = 0; round < 50; round++) {
    const parsed = profileUpdateSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    const [field, index] = issue?.path ?? [];
    if (typeof field !== 'string' || !(field in value)) return EMPTY_PROFILE;
    const current = value[field as keyof ProfileUpdate];
    value = {
      ...value,
      [field]: Array.isArray(current)
        ? typeof index === 'number'
          ? current.filter((_, i) => i !== index)
          : []
        : null,
    };
  }
  return EMPTY_PROFILE;
}
