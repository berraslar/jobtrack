import { z } from 'zod';

// Sınırlı değer kümeleri: veritabanındaki CHECK kısıtlarıyla birebir aynıdır (0002_domain.sql).

/** FR-05: başvuru aşamaları, akış sırasıyla. Son dördü kapanış aşamasıdır. */
export const APPLICATION_STAGES = [
  'saved',
  'applied',
  'screening',
  'technical',
  'assignment',
  'final',
  'offer',
  'accepted',
  'rejected',
  'no_response',
  'withdrawn',
] as const;
export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export const CLOSED_STAGES: readonly ApplicationStage[] = [
  'accepted',
  'rejected',
  'no_response',
  'withdrawn',
];

export const APPLICATION_SOURCES = [
  'linkedin',
  'kariyer_net',
  'youthall',
  'company_site',
  'referral',
  'other',
] as const;
export type ApplicationSource = (typeof APPLICATION_SOURCES)[number];

export const WORK_MODES = ['office', 'hybrid', 'remote'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const ACTIVITY_TYPES = ['interview', 'email', 'call', 'assignment'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// FR-16: arayüz dilleri. Varsayılan Türkçedir (veritabanındaki varsayılanla aynı).
export const LOCALES = ['tr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'tr';
export const localeSchema = z.enum(LOCALES);

export interface DomainLabels {
  stages: Record<ApplicationStage, string>;
  sources: Record<ApplicationSource, string>;
  workModes: Record<WorkMode, string>;
  activities: Record<ActivityType, string>;
}

/**
 * Sınırlı değer kümelerinin görünen adları; arayüz ve dışa aktarma (CSV, takvim) ortak kullanır.
 * Sunucu kodu `domainLabels(locale)` ile erişir (dinamik anahtarla nesne erişimi yok).
 */
export const DOMAIN_LABELS: Record<Locale, DomainLabels> = {
  tr: {
    stages: {
      saved: 'Kaydedildi',
      applied: 'Başvuruldu',
      screening: 'İlk görüşme',
      technical: 'Teknik mülakat',
      assignment: 'Vaka/ödev',
      final: 'Son mülakat',
      offer: 'Teklif',
      accepted: 'Kabul',
      rejected: 'Red',
      no_response: 'Dönüş yok',
      withdrawn: 'Geri çekildi',
    },
    sources: {
      linkedin: 'LinkedIn',
      kariyer_net: 'Kariyer.net',
      youthall: 'Youthall',
      company_site: 'Şirket sitesi',
      referral: 'Referans',
      other: 'Diğer',
    },
    workModes: { office: 'Ofis', hybrid: 'Hibrit', remote: 'Uzaktan' },
    activities: {
      interview: 'Mülakat',
      email: 'E-posta',
      call: 'Telefon',
      assignment: 'Ödev teslimi',
    },
  },
  en: {
    stages: {
      saved: 'Saved',
      applied: 'Applied',
      screening: 'Screening',
      technical: 'Technical interview',
      assignment: 'Case/assignment',
      final: 'Final interview',
      offer: 'Offer',
      accepted: 'Accepted',
      rejected: 'Rejected',
      no_response: 'No response',
      withdrawn: 'Withdrawn',
    },
    sources: {
      linkedin: 'LinkedIn',
      kariyer_net: 'Kariyer.net',
      youthall: 'Youthall',
      company_site: 'Company website',
      referral: 'Referral',
      other: 'Other',
    },
    workModes: { office: 'On-site', hybrid: 'Hybrid', remote: 'Remote' },
    activities: {
      interview: 'Interview',
      email: 'Email',
      call: 'Phone call',
      assignment: 'Assignment submission',
    },
  },
};

export function domainLabels(locale: Locale): DomainLabels {
  return locale === 'en' ? DOMAIN_LABELS.en : DOMAIN_LABELS.tr;
}

// Ortak alan kuralları

/** Zorunlu metin: kırpılır, boş olamaz. */
const requiredText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `${label} boş olamaz.` })
    .max(max, { error: `${label} en fazla ${String(max)} karakter olabilir.` });

/**
 * İsteğe bağlı metin. Boş metin `null` olur (formdan gelen boş alan = değer yok).
 * PATCH'te `undefined` "değiştirme", `null` "temizle" anlamına gelir.
 */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} en fazla ${String(max)} karakter olabilir.` })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

/** Yalnızca http(s) bağlantıları (javascript: gibi şemalar reddedilir — XSS). */
const optionalUrl = (label: string) =>
  z
    .string()
    .trim()
    .max(2048, { error: `${label} çok uzun.` })
    .transform((value) => (value === '' ? null : value))
    .pipe(
      z
        .url({ protocol: /^https?$/, error: `${label} http:// veya https:// ile başlamalı.` })
        .nullable(),
    )
    .nullable()
    .optional();

const isoDate = z.iso.date({ error: 'Tarih YYYY-AA-GG biçiminde olmalı.' });

export const idParamSchema = z.strictObject({ id: z.uuid() });

// Şirketler (FR-13)

export const companyCreateSchema = z.strictObject({
  name: requiredText(200, 'Şirket adı'),
  sector: optionalText(100, 'Sektör'),
  website: optionalUrl('Web sitesi'),
  notes: optionalText(10_000, 'Notlar'),
});
export type CompanyCreate = z.infer<typeof companyCreateSchema>;

export const companyUpdateSchema = companyCreateSchema.partial();
export type CompanyUpdate = z.infer<typeof companyUpdateSchema>;

export const companySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  sector: z.string().nullable(),
  website: z.string().nullable(),
  notes: z.string().nullable(),
  applicationCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Company = z.infer<typeof companySchema>;

// CV versiyonları (FR-08)

export const cvVersionCreateSchema = z.strictObject({
  label: requiredText(100, 'Etiket'),
  fileName: optionalText(255, 'Dosya adı'),
});
export type CvVersionCreate = z.infer<typeof cvVersionCreateSchema>;

export const cvVersionUpdateSchema = cvVersionCreateSchema.partial();
export type CvVersionUpdate = z.infer<typeof cvVersionUpdateSchema>;

export const cvVersionSchema = z.strictObject({
  id: z.uuid(),
  label: z.string(),
  fileName: z.string().nullable(),
  /** Yüklenmiş PDF dosyası; yoksa null (ADR-0006). */
  file: z
    .strictObject({ sizeBytes: z.number().int().positive(), uploadedAt: z.iso.datetime() })
    .nullable(),
  applicationCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type CvVersion = z.infer<typeof cvVersionSchema>;

// CV dosyası (FR-08, ADR-0006). Gövde ham PDF'tir; ad ve etiket başlıkta, URI kodlamasıyla gelir.

export const CV_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const CV_FILE_TYPE = 'application/pdf';
/** PDF dosyaları bu baytlarla başlar ("%PDF-"); uzantı ve tarayıcının bildirdiği tür yeterli değildir. */
export const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;

/** Başlıktaki URI kodlu metni çözer; geçersiz kodlama boş metin olur (şema reddeder). */
const encodedHeader = z
  .string()
  .max(1024)
  .transform((value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return '';
    }
  });

/** Dosya adı yalnızca gösterim ve indirme adıdır; yol ve kontrol karakterleri atılır. */
export const cvFileNameSchema = encodedHeader.pipe(
  z
    .string()
    .transform((name) =>
      // eslint-disable-next-line no-control-regex
      (name.split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f"]/g, '').trim(),
    )
    .pipe(requiredText(255, 'Dosya adı')),
);

export const cvFileUploadHeadersSchema = z.object({
  'x-file-name': cvFileNameSchema,
});

export const cvVersionUploadHeadersSchema = cvFileUploadHeadersSchema.extend({
  'x-cv-label': encodedHeader.pipe(requiredText(100, 'Etiket')),
});

// Başvurular (FR-04, FR-05, FR-15)

const applicationFields = {
  positionTitle: requiredText(200, 'Pozisyon'),
  cvVersionId: z.uuid().nullable().optional(),
  jobUrl: optionalUrl('İlan bağlantısı'),
  source: z.enum(APPLICATION_SOURCES).nullable().optional(),
  location: optionalText(200, 'Konum'),
  workMode: z.enum(WORK_MODES).nullable().optional(),
  salaryExpectation: optionalText(100, 'Maaş beklentisi'),
  appliedAt: isoDate.nullable().optional(),
  notes: optionalText(10_000, 'Notlar'),
};

/**
 * NFR-09: tek form, zorunlu alanlar yalnızca şirket ve pozisyon. Şirket mevcut bir kayıt (ID) ya da
 * yeni bir ad olarak verilir; aynı adda şirket varsa o kullanılır.
 */
export const applicationCreateSchema = z.union([
  z.strictObject({ companyId: z.uuid(), ...applicationFields }),
  z.strictObject({ companyName: requiredText(200, 'Şirket adı'), ...applicationFields }),
]);
export type ApplicationCreate = z.infer<typeof applicationCreateSchema>;

/** Aşama bu uçla değişmez (FR-06: geçmişli değişiklik ayrı uçtadır). */
export const applicationUpdateSchema = z
  .strictObject({ companyId: z.uuid(), ...applicationFields })
  .partial();
export type ApplicationUpdate = z.infer<typeof applicationUpdateSchema>;

export const stageChangeSchema = z.strictObject({ stage: z.enum(APPLICATION_STAGES) });
export type StageChange = z.infer<typeof stageChangeSchema>;

/** FR-10: arama ve filtreler. Tümü sorgu parametresidir (URL'de paylaşılabilir). */
export const applicationListQuerySchema = z.strictObject({
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
  /** Şirket adı veya pozisyon içinde arama. */
  q: z.string().trim().max(100).optional(),
  stage: z.enum(APPLICATION_STAGES).optional(),
  source: z.enum(APPLICATION_SOURCES).optional(),
  cvVersionId: z.uuid().optional(),
  companyId: z.uuid().optional(),
  appliedFrom: isoDate.optional(),
  appliedTo: isoDate.optional(),
  /** FR-11: yalnızca takip edilmesi gerekenler. */
  followUp: z.stringbool().optional(),
});
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;

export const applicationSchema = z.strictObject({
  id: z.uuid(),
  company: z.strictObject({ id: z.uuid(), name: z.string() }),
  cvVersion: z.strictObject({ id: z.uuid(), label: z.string() }).nullable(),
  positionTitle: z.string(),
  jobUrl: z.string().nullable(),
  source: z.enum(APPLICATION_SOURCES).nullable(),
  location: z.string().nullable(),
  workMode: z.enum(WORK_MODES).nullable(),
  salaryExpectation: z.string().nullable(),
  currentStage: z.enum(APPLICATION_STAGES),
  appliedAt: isoDate.nullable(),
  archivedAt: z.iso.datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Son temas: başvuru tarihi, son aşama değişikliği veya son etkinlikten en yenisi. */
  lastActivityAt: z.iso.datetime(),
  /** FR-11: açık başvuruda son temastan bu yana kullanıcının belirlediği gün sayısı geçti. */
  needsFollowUp: z.boolean(),
});
export type Application = z.infer<typeof applicationSchema>;

export const stageHistoryEntrySchema = z.strictObject({
  id: z.uuid(),
  fromStage: z.enum(APPLICATION_STAGES).nullable(),
  toStage: z.enum(APPLICATION_STAGES),
  changedAt: z.iso.datetime(),
});
export type StageHistoryEntry = z.infer<typeof stageHistoryEntrySchema>;

// Etkinlikler (FR-07)

export const activityCreateSchema = z.strictObject({
  type: z.enum(ACTIVITY_TYPES),
  occurredAt: z.iso.datetime({ offset: true, error: 'Geçerli bir tarih ve saat girin.' }),
  contactName: optionalText(200, 'Görüşülen kişi'),
  notes: optionalText(5_000, 'Notlar'),
});
export type ActivityCreate = z.infer<typeof activityCreateSchema>;

export const activityUpdateSchema = activityCreateSchema.partial();
export type ActivityUpdate = z.infer<typeof activityUpdateSchema>;

export const activitySchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  type: z.enum(ACTIVITY_TYPES),
  occurredAt: z.iso.datetime(),
  contactName: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Activity = z.infer<typeof activitySchema>;

export const applicationDetailSchema = applicationSchema.extend({
  stageHistory: z.array(stageHistoryEntrySchema),
  activities: z.array(activitySchema),
});
export type ApplicationDetail = z.infer<typeof applicationDetailSchema>;

export const companyDetailSchema = companySchema.extend({
  applications: z.array(applicationSchema),
});
export type CompanyDetail = z.infer<typeof companyDetailSchema>;

// Liste yanıtları
export const companyListSchema = z.strictObject({ companies: z.array(companySchema) });
export const cvVersionListSchema = z.strictObject({ cvVersions: z.array(cvVersionSchema) });
export const applicationListSchema = z.strictObject({ applications: z.array(applicationSchema) });

// Kullanıcı ayarları

export const settingsSchema = z.strictObject({
  /** FR-11: kaç gün dönüş gelmezse "Takip et" işareti çıkar. */
  followUpDays: z.number().int().min(1).max(365),
  /** FR-16: arayüz dili; dışa aktarılan CSV ve takvim de bu dilde olur. */
  locale: localeSchema,
});
export type Settings = z.infer<typeof settingsSchema>;

/** Kısmi güncelleme: verilmeyen alan değişmez; en az bir alan gerekir. */
export const settingsUpdateSchema = z
  .strictObject({
    followUpDays: z.coerce
      .number({ error: 'Gün sayısı girin.' })
      .int({ error: 'Tam sayı girin.' })
      .min(1, { error: 'En az 1 gün olmalı.' })
      .max(365, { error: 'En fazla 365 gün olabilir.' })
      .optional(),
    locale: localeSchema.optional(),
  })
  .refine((value) => value.followUpDays !== undefined || value.locale !== undefined, {
    error: 'Değiştirilecek bir ayar girin.',
  });
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
