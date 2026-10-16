// ADR-0010, NFR-14: kişisel bilgiler yapay zekâ sağlayıcısına gitmeden önce yer tutucularla
// değiştirilir, yanıt geldiğinde sunucuda geri yerleştirilir. Eşlemeler yalnızca istek süresince
// bellekte tutulur; hiçbir yere yazılmaz ve loglanmaz.

export type PlaceholderKind = 'AD' | 'EPOSTA' | 'TELEFON' | 'ADRES' | 'BAGLANTI' | 'OZEL';

/** Profilden (FR-20) ve kullanıcının eklediği ifadelerden gelen bilinen kişisel değerler. */
export interface KnownPii {
  fullName?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  location?: string | null | undefined;
  links?: (string | null | undefined)[];
  /** Kullanıcının ayrıca maskelenmesini istediği ifadeler (örn. açık adres). */
  extraTerms?: string[];
}

export interface MaskResult {
  masked: string;
  /** Yer tutucu → asıl değer. */
  mapping: Map<string, string>;
}

export interface RestoreResult {
  text: string;
  /** Çıktıda geçen ama eşlemede olmayan yer tutucular (model uydurmuş olabilir). */
  unknownPlaceholders: string[];
}

// Sabit desenler (kullanıcı girdisinden kurulmaz). Sınırlı niceleyiciler: geri izleme patlaması yok.
const EMAIL = /[\p{L}\p{N}._%+-]{1,64}@[\p{L}\p{N}][\p{L}\p{N}.-]{0,252}\.\p{L}{2,24}/gu;
const URL_PATTERN =
  /\b(?:https?:\/\/|www\.)[^\s<>()[\]"']{1,2000}|\b(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|medium\.com)\/[^\s<>()[\]"']{1,500}/giu;
/** En az 10 rakam içeren, rakam/boşluk/parantez/tire/nokta dizisi (+ ile başlayabilir). */
const PHONE = /\+?\(?\d[\d\s().-]{8,22}\d/g;
const PLACEHOLDER = /\[\[(AD|EPOSTA|TELEFON|ADRES|BAGLANTI|OZEL)_(\d{1,3})\]\]/g;
const LETTER = /\p{L}/u;

const digitCount = (value: string) => value.replace(/\D/g, '').length;

/** Bir metinde `needle`'ın tüm geçişlerini, harf sınırına bakarak (isteğe bağlı) değiştirir. */
function replaceLiteral(text: string, needle: string, replacement: string, wordBound: boolean) {
  if (needle === '') return text;
  let out = '';
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) break;
    const before = text.charAt(at - 1);
    const after = text.charAt(at + needle.length);
    const bounded = !wordBound || (!LETTER.test(before) && !LETTER.test(after));
    out += text.slice(from, at) + (bounded ? replacement : needle);
    from = at + needle.length;
  }
  return out + text.slice(from);
}

class Masker {
  private readonly mapping = new Map<string, string>();
  private readonly byValue = new Map<string, string>();
  private readonly counters = new Map<PlaceholderKind, number>();

  placeholder(kind: PlaceholderKind, value: string): string {
    const existing = this.byValue.get(value);
    if (existing) return existing;
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    const token = `[[${kind}_${String(n)}]]`;
    this.mapping.set(token, value);
    this.byValue.set(value, token);
    return token;
  }

  result(masked: string): MaskResult {
    return { masked, mapping: this.mapping };
  }
}

/** Değerin metinde geçebilecek biçimleri: olduğu gibi ve büyük harfle (CV başlıkları). */
function variants(value: string): string[] {
  const trimmed = value.trim();
  return [...new Set([trimmed, trimmed.toLocaleUpperCase('tr')])];
}

/**
 * Metindeki kişisel bilgileri yer tutucularla değiştirir. Önce bilinen değerler (uzundan kısaya),
 * sonra desenle yakalananlar (e-posta, bağlantı, telefon) maskelenir. Açık adresler desenle
 * güvenilir biçimde bulunamaz; profildeki konum ve `extraTerms` ile kapatılır.
 */
export function maskPii(text: string, known: KnownPii): MaskResult {
  const masker = new Masker();
  const entries: { kind: PlaceholderKind; value: string; wordBound: boolean }[] = [];
  const add = (kind: PlaceholderKind, value: string | null | undefined, wordBound = false) => {
    const v = value?.trim();
    if (v && v.length >= 2) entries.push({ kind, value: v, wordBound });
  };

  add('AD', known.fullName, true);
  // Soyadı tek başına da geçebilir ("Yılmaz, A."); 3 harften kısa parçalar sıradan kelime olabilir.
  const nameParts = known.fullName?.trim().split(/\s+/) ?? [];
  const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;
  if (surname && surname.length >= 3) add('AD', surname, true);
  add('EPOSTA', known.email);
  add('TELEFON', known.phone);
  add('ADRES', known.location, true);
  for (const link of known.links ?? []) add('BAGLANTI', link);
  for (const term of known.extraTerms ?? []) add('OZEL', term, true);

  // Uzun değer önce: "Ayşe Yılmaz" maskelenmeden "Yılmaz" maskelenmesin.
  entries.sort((a, b) => b.value.length - a.value.length);
  let masked = text;
  for (const { kind, value, wordBound } of entries) {
    for (const variant of variants(value)) {
      masked = replaceLiteral(masked, variant, masker.placeholder(kind, variant), wordBound);
    }
  }

  masked = masked.replace(EMAIL, (match) => masker.placeholder('EPOSTA', match));
  masked = masked.replace(URL_PATTERN, (match) => {
    // Cümle sonundaki noktalama bağlantının parçası değildir.
    const trailing = /[.,;:!?]+$/.exec(match)?.[0] ?? '';
    const link = match.slice(0, match.length - trailing.length);
    return masker.placeholder('BAGLANTI', link) + trailing;
  });
  masked = masked.replace(PHONE, (match) => {
    // Tarih aralıkları ve yıllar telefon değildir: en az 10 rakam ister.
    if (digitCount(match) < 10 || digitCount(match) > 15) return match;
    return masker.placeholder('TELEFON', match.trim());
  });

  return masker.result(masked);
}

/** Yer tutucuları asıl değerlerle değiştirir; eşlemede olmayanları raporlar. */
export function restorePii(text: string, mapping: Map<string, string>): RestoreResult {
  const unknown = new Set<string>();
  const restored = text.replace(PLACEHOLDER, (token) => {
    const original = mapping.get(token);
    if (original === undefined) {
      unknown.add(token);
      return token;
    }
    return original;
  });
  return { text: restored, unknownPlaceholders: [...unknown] };
}
