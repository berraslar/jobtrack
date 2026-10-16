import { z } from 'zod';

// FR-23, FR-24 (ADR-0010): Ana CV, ilan metni ve ilana göre uyarlanmış CV sürümleri.

export const MASTER_CV_MAX = 30_000;
export const JOB_DESCRIPTION_MAX = 20_000;

/** Markdown metni: boşluklar korunur (biçimin parçasıdır), yalnızca uzunluk sınırlanır. */
const markdown = (max: number, label: string) =>
  z.string().max(max, { error: `${label} en fazla ${String(max)} karakter olabilir.` });

// Ana CV (FR-23)

export const masterCvSchema = z.strictObject({
  markdown: z.string(),
  updatedAt: z.iso.datetime().nullable(),
});
export type MasterCv = z.infer<typeof masterCvSchema>;

export const masterCvUpdateSchema = z.strictObject({
  markdown: markdown(MASTER_CV_MAX, 'Ana CV'),
});
export type MasterCvUpdate = z.infer<typeof masterCvUpdateSchema>;

/** PDF'ten okunan Ana CV taslağı; kaydedilmez, kullanıcı onaylayınca PUT ile kaydedilir. */
export const masterCvImportSchema = z.strictObject({
  markdown: markdown(MASTER_CV_MAX, 'Ana CV'),
  method: z.enum(['text', 'ocr']),
});
export type MasterCvImport = z.infer<typeof masterCvImportSchema>;

// İlan metni (FR-23)

export const jobDescriptionSchema = z.strictObject({
  jobDescription: z.string().nullable(),
});
export type JobDescription = z.infer<typeof jobDescriptionSchema>;

/** Boş ya da yalnızca boşluk olan metin `null` olur (ilan metni yok). */
export const jobDescriptionUpdateSchema = z.strictObject({
  jobDescription: markdown(JOB_DESCRIPTION_MAX, 'İlan metni')
    .transform((value) => (value.trim() === '' ? null : value))
    .nullable(),
});
export type JobDescriptionUpdate = z.infer<typeof jobDescriptionUpdateSchema>;

// Yapay zekâ ile uyarlama (FR-24, ADR-0010)

export const TAILOR_LIMITS = {
  missingKeywords: 30,
  keyword: 60,
  changes: 20,
  change: 300,
  extraMaskTerms: 20,
  extraMaskTerm: 120,
} as const;

/**
 * Modelin döndürmesi gereken sabit JSON şeması. Model çıktısı güvenilmeyen girdidir: bu şemadan
 * geçmeyen yanıt reddedilir; tanımsız alanlar da kabul edilmez.
 */
export const tailorResultSchema = z.strictObject({
  tailoredMarkdown: z.string().trim().min(1).max(MASTER_CV_MAX),
  matchScore: z.number().int().min(0).max(100),
  missingKeywords: z
    .array(z.string().trim().min(1).max(TAILOR_LIMITS.keyword))
    .max(TAILOR_LIMITS.missingKeywords),
  changes: z.array(z.string().trim().min(1).max(TAILOR_LIMITS.change)).max(TAILOR_LIMITS.changes),
});
export type TailorResult = z.infer<typeof tailorResultSchema>;

/** Uyarlama isteği. Gönderim için her istekte açık onay gerekir (ADR-0010, 1. madde). */
export const tailorRequestSchema = z.strictObject({
  consent: z.literal(true, { error: 'Gönderim için onay vermeniz gerekiyor.' }),
  extraMaskTerms: z
    .array(z.string().trim().min(2).max(TAILOR_LIMITS.extraMaskTerm))
    .max(TAILOR_LIMITS.extraMaskTerms)
    .default([]),
  /** Uyarlanmış CV tek A4 sayfaya sığacak uzunlukta istenir (varsayılan açık). */
  onePage: z.boolean().default(true),
});
export type TailorRequest = z.input<typeof tailorRequestSchema>;

/** Ana CV'de olmayan tarih, süre, şirket adı ya da modelin uydurduğu yer tutucu. */
export const fabricationWarningSchema = z.strictObject({
  kind: z.enum(['date', 'duration', 'company', 'placeholder']),
  text: z.string(),
});
export type FabricationWarning = z.infer<typeof fabricationWarningSchema>;

/** Uyarlama taslağı: kaydedilmez, kullanıcı inceleyip düzenler. */
export const tailorDraftSchema = tailorResultSchema.extend({
  warnings: z.array(fabricationWarningSchema),
  /** Gönderimden önce maskelenen kişisel bilgi sayısı. */
  maskedCount: z.number().int().min(0),
  model: z.string(),
});
export type TailorDraft = z.infer<typeof tailorDraftSchema>;

// Kaydedilen sürümler (FR-24)

export const tailoredCvSchema = z.strictObject({
  id: z.uuid(),
  applicationId: z.uuid(),
  markdown: z.string(),
  matchScore: z.number().int().min(0).max(100).nullable(),
  missingKeywords: z.array(z.string()),
  changes: z.array(z.string()),
  model: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TailoredCv = z.infer<typeof tailoredCvSchema>;

export const tailoredCvListSchema = z.strictObject({ tailoredCvs: z.array(tailoredCvSchema) });

export const tailoredCvCreateSchema = z.strictObject({
  markdown: z.string().trim().min(1, { error: 'CV boş olamaz.' }).max(MASTER_CV_MAX),
  matchScore: z.number().int().min(0).max(100).nullable().default(null),
  missingKeywords: tailorResultSchema.shape.missingKeywords.default([]),
  changes: tailorResultSchema.shape.changes.default([]),
  model: z.string().trim().max(100).nullable().default(null),
});
export type TailoredCvCreate = z.input<typeof tailoredCvCreateSchema>;
export type TailoredCvCreateParsed = z.output<typeof tailoredCvCreateSchema>;

export const tailoredCvUpdateSchema = z.strictObject({
  markdown: tailoredCvCreateSchema.shape.markdown,
});
export type TailoredCvUpdate = z.infer<typeof tailoredCvUpdateSchema>;

/** Arayüzün özelliği gösterip göstermeyeceği; anahtar ya da sağlayıcı ayrıntısı içermez. */
export const aiStatusSchema = z.strictObject({
  enabled: z.boolean(),
  model: z.string().nullable(),
});
export type AiStatus = z.infer<typeof aiStatusSchema>;
