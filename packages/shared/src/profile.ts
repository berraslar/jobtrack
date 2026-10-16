import { z } from 'zod';

// FR-20/FR-21: kullanıcı profili (ADR-0008). Tüm alanlar isteğe bağlıdır; boş metin "yok" demektir.

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} en fazla ${String(max)} karakter olabilir.` })
    .transform((value) => (value === '' ? null : value))
    .nullable();

const httpUrl = (label: string) =>
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
    .nullable();

/** "2021", "2021-03" ya da boş; "Halen" bitiş tarihi null + current: true ile gösterilir. */
const yearMonth = z
  .string()
  .trim()
  .regex(/^(\d{4})(-(0[1-9]|1[0-2]))?$/, { error: 'Tarih YYYY ya da YYYY-AA biçiminde olmalı.' })
  .nullable();

export const experienceSchema = z.strictObject({
  title: text(200, 'Unvan'),
  company: text(200, 'Şirket'),
  start: yearMonth,
  end: yearMonth,
  current: z.boolean(),
  description: text(2000, 'Açıklama'),
});
export type Experience = z.infer<typeof experienceSchema>;

export const educationSchema = z.strictObject({
  school: text(200, 'Okul'),
  degree: text(200, 'Bölüm/derece'),
  start: yearMonth,
  end: yearMonth,
});
export type Education = z.infer<typeof educationSchema>;

const tag = z.string().trim().min(1).max(60);

export const profileFields = {
  fullName: text(120, 'Ad soyad'),
  headline: text(160, 'Unvan'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .transform((value) => (value === '' ? null : value))
    .pipe(z.email({ error: 'Geçerli bir e-posta adresi girin.' }).nullable())
    .nullable(),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+\d][\d\s().-]*$/, { error: 'Telefon yalnızca rakam, boşluk ve + ( ) - içerebilir.' })
    .or(z.literal(''))
    .transform((value) => (value === '' ? null : value))
    .nullable(),
  location: text(120, 'Konum'),
  website: httpUrl('Web sitesi'),
  linkedin: httpUrl('LinkedIn'),
  github: httpUrl('GitHub'),
  summary: text(4000, 'Özet'),
  skills: z.array(tag).max(100),
  languages: z.array(tag).max(20),
  experience: z.array(experienceSchema).max(30),
  education: z.array(educationSchema).max(15),
};

export const profileUpdateSchema = z.strictObject(profileFields);
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const profileSchema = profileUpdateSchema.extend({
  updatedAt: z.iso.datetime().nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

/** CV'den çıkarılan öneri: hiçbir şey kaydedilmez, kullanıcı onay ekranında seçer (FR-21). */
export const profileDraftSchema = z.strictObject({
  draft: profileUpdateSchema,
  method: z.enum(['text', 'ocr']),
  cvVersionId: z.uuid(),
});
export type ProfileDraft = z.infer<typeof profileDraftSchema>;

export const profileExtractRequestSchema = z.strictObject({ cvVersionId: z.uuid() });

export const EMPTY_PROFILE: ProfileUpdate = {
  fullName: null,
  headline: null,
  email: null,
  phone: null,
  location: null,
  website: null,
  linkedin: null,
  github: null,
  summary: null,
  skills: [],
  languages: [],
  experience: [],
  education: [],
};
