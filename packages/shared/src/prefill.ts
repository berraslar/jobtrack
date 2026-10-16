import { z } from 'zod';
import { JOB_DESCRIPTION_MAX } from './cv-tailor.js';
import { APPLICATION_SOURCES, type ApplicationSource } from './domain.js';

// FR-22, ADR-0009: yer imi betiğinin açtığı `/basvurular/yeni?…#ilan=…` adresindeki parametreler.
// Adres çubuğundan gelen her değer güvenilmeyen girdidir: burada temizlenir, uzunluğu sınırlanır
// ve doğrulanır. Geçmeyen alan forma hiç girmez; formu gönderince sunucu yeniden doğrular.
// İlan metni sorgu dizesinde değil adres parçasında (#) gelir: parça sunucuya hiç gönderilmez,
// erişim loglarına girmez (A09, NFR-14).

/** Başvuru şemasıyla aynı sınırlar (applicationCreateSchema). */
export const PREFILL_LIMITS = {
  title: 200,
  company: 200,
  location: 200,
  url: 2048,
} as const;

/** Adres çubuğunda kabul edilen parametre adları. */
export const PREFILL_PARAMS = [
  'title',
  'company',
  'location',
  'url',
  'source',
  'appliedAt',
] as const;
export type PrefillParam = (typeof PREFILL_PARAMS)[number];

export interface ApplicationPrefill {
  positionTitle?: string;
  companyName?: string;
  location?: string;
  jobUrl?: string;
  source?: ApplicationSource;
  appliedAt?: string;
  /** Adres parçasındaki (`#ilan=`) ilan metni; başvuruyla birlikte kaydedilir (FR-23). */
  jobDescription?: string;
}

/** Adres parçasındaki ilan metni parametresi. */
export const PREFILL_DESCRIPTION_PARAM = 'ilan';

export interface PrefillResult {
  values: ApplicationPrefill;
  /** Doğrulamadan geçmediği için alınmayan parametreler (kullanıcıya uyarı olarak gösterilir). */
  rejected: (PrefillParam | 'description')[];
}

/** Kontrol ve biçim karakterlerini atar, boşlukları tek boşluğa indirir. */
export function cleanText(value: string): string {
  return (
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Çok satırlı metin (ilan metni): satır sonları korunur, diğer kontrol ve biçim karakterleri
 * atılır, satır içi boşluklar sadeleştirilir, üçten fazla boş satır ikiye indirilir.
 */
export function cleanMultiline(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,
      ' ',
    )
    .split('\n')
    .map((line) => line.replace(/[ \u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const LINKEDIN_JOB_ID = /^\d{6,20}$/;

/** Bağlantıdan atılan izleme parametreleri. */
const TRACKING_PARAM =
  /^(utm_|mc_|_hs|hsa_)|^(gclid|fbclid|msclkid|yclid|igshid|refId|trk|trackingId)$/i;

/**
 * Bir LinkedIn ilan adresinden temiz, kanonik bağlantıyı üretir:
 * `https://www.linkedin.com/jobs/view/<id>/`. İlan kimliği `currentJobId` parametresinden ya da
 * `/jobs/view/<id>` (veya `/jobs/view/<başlık>-<id>`) yolundan alınır; izleme parametreleri atılır.
 * Yalnızca `https:`, kullanıcı bilgisi içermeyen ve alan adı tam olarak `linkedin.com` veya
 * `.linkedin.com` ile biten adresler kabul edilir. Geçmezse `null`.
 */
export function canonicalLinkedInJobUrl(raw: string): string | null {
  if (raw.length > PREFILL_LIMITS.url) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'linkedin.com' && !host.endsWith('.linkedin.com')) return null;

  const fromParam = url.searchParams.get('currentJobId');
  // `/jobs/view/<id>` ya da `/jobs/view/<başlık>-<id>`: son parçanın son tireden sonrası.
  const segments = url.pathname.split('/').filter((part) => part !== '');
  const last =
    segments.length === 3 && segments[0] === 'jobs' && segments[1] === 'view'
      ? segments[2]
      : undefined;
  const fromPath = last?.slice(last.lastIndexOf('-') + 1);
  const id = fromParam ?? fromPath ?? null;
  if (id === null || !LINKEDIN_JOB_ID.test(id)) return null;
  return `https://www.linkedin.com/jobs/view/${id}/`;
}

/**
 * İlan bağlantısını doğrular ve temizler (FR-22). LinkedIn adresleri kanonik ilan bağlantısına
 * çevrilir (geçmezse reddedilir); diğer siteler için yalnızca `https:`, kullanıcı bilgisi içermeyen
 * adresler kabul edilir, izleme parametreleri ve adres parçası atılır. Geçmezse `null`.
 */
export function cleanJobUrl(raw: string): string | null {
  if (raw.length > PREFILL_LIMITS.url) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null;
  const host = url.hostname.toLowerCase();
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com'))
    return canonicalLinkedInJobUrl(raw);
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(name)) url.searchParams.delete(name);
  }
  url.hash = '';
  const cleaned = url.toString();
  return cleaned.length <= PREFILL_LIMITS.url ? cleaned : null;
}

const textParam = (max: number) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));
const fieldSchemas = new Map<PrefillParam, z.ZodType<string, string>>([
  ['title', textParam(PREFILL_LIMITS.title)],
  ['company', textParam(PREFILL_LIMITS.company)],
  ['location', textParam(PREFILL_LIMITS.location)],
  [
    'url',
    z.string().transform((value, ctx) => {
      const canonical = cleanJobUrl(value.trim());
      if (canonical === null) {
        ctx.addIssue({
          code: 'custom',
          message: 'Yalnızca https:// ile başlayan bir ilan bağlantısı kabul edilir.',
        });
        return z.NEVER;
      }
      return canonical;
    }),
  ],
  ['source', z.enum(APPLICATION_SOURCES)],
  ['appliedAt', z.iso.date()],
]);

/**
 * Adres parametrelerini forma uygun değerlere çevirir. Bilinmeyen parametreler yok sayılır; boş
 * parametreler sessizce atlanır; geçersiz olanlar `rejected` listesine girer.
 */
export function parsePrefill(params: URLSearchParams, hash = ''): PrefillResult {
  const values: ApplicationPrefill = {};
  const rejected: PrefillResult['rejected'] = [];
  for (const name of PREFILL_PARAMS) {
    const raw = params.get(name);
    if (raw === null || raw.trim() === '') continue;
    // Uzunluk sınırı ayrıştırmadan önce: çok uzun girdi işlenmeden reddedilir.
    if (raw.length > PREFILL_LIMITS.url) {
      rejected.push(name);
      continue;
    }
    const parsed = fieldSchemas.get(name)?.safeParse(raw);
    if (!parsed?.success) {
      rejected.push(name);
      continue;
    }
    const value = parsed.data;
    if (name === 'title') values.positionTitle = value;
    else if (name === 'company') values.companyName = value;
    else if (name === 'location') values.location = value;
    else if (name === 'url') values.jobUrl = value;
    else if (name === 'source') values.source = value as ApplicationSource;
    else values.appliedAt = value;
  }
  const description = descriptionFromHash(hash);
  if (description === null) rejected.push('description');
  else if (description !== undefined) {
    // Kodlanmış metin üst sınırın birkaç katı olabilir; çözülmüş metin sınırı aşarsa reddedilir.
    const text = cleanMultiline(description);
    if (text.length > JOB_DESCRIPTION_MAX) rejected.push('description');
    else if (text !== '') values.jobDescription = text;
  }
  return { values, rejected };
}

/** `#ilan=…` parçasını okur: yoksa `undefined`, çözülmeden reddedilecek kadar uzunsa `null`. */
function descriptionFromHash(hash: string): string | null | undefined {
  if (!hash.startsWith('#')) return undefined;
  // Yüzde kodlaması bir karakteri en fazla 12 karaktere (4 bayt × "%XX") çıkarır.
  if (hash.length > JOB_DESCRIPTION_MAX * 12) return null;
  return new URLSearchParams(hash.slice(1)).get(PREFILL_DESCRIPTION_PARAM) ?? undefined;
}

/** Adres parametrelerinden en az biri önceden doldurma içindir. */
export const hasPrefill = (params: URLSearchParams, hash = ''): boolean =>
  PREFILL_PARAMS.some((name) => params.has(name)) || descriptionFromHash(hash) !== undefined;
