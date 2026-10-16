import { z } from 'zod';
import { emailCodeSchema, recoveryCodeSchema, totpCodeSchema } from './auth.js';
import { APPLICATION_SOURCES, APPLICATION_STAGES } from './domain.js';

// FR-12: pano

/** Bir grup (tümü, CV versiyonu, kaynak) için dönüşüm hunisi. Oranlar istemcide hesaplanır. */
export const funnelSchema = z.strictObject({
  /** "Kaydedildi" aşamasını geçmiş, yani gerçekten başvurulmuş olanlar. */
  applied: z.number().int().nonnegative(),
  /** Şirketten herhangi bir dönüş (görüşme daveti veya red). */
  responded: z.number().int().nonnegative(),
  /** En az bir görüşme/mülakat aşamasına geçenler. */
  interviewed: z.number().int().nonnegative(),
  /** Teklif alınanlar. */
  offered: z.number().int().nonnegative(),
});
export type Funnel = z.infer<typeof funnelSchema>;

export const statsSchema = z.strictObject({
  /** Arşivde olmayan başvuruların aşamalara dağılımı. */
  byStage: z.array(
    z.strictObject({ stage: z.enum(APPLICATION_STAGES), count: z.number().int().nonnegative() }),
  ),
  overall: funnelSchema,
  byCvVersion: z.array(
    funnelSchema.extend({ cvVersionId: z.uuid().nullable(), label: z.string().nullable() }),
  ),
  bySource: z.array(funnelSchema.extend({ source: z.enum(APPLICATION_SOURCES).nullable() })),
  /** Son 12 haftada, başvuru tarihine göre haftalık başvuru sayısı (hafta Pazartesi başlar). */
  weekly: z.array(
    z.strictObject({ weekStart: z.iso.date(), count: z.number().int().nonnegative() }),
  ),
  followUpCount: z.number().int().nonnegative(),
  /** Arşivde olmayan başvurulardaki ilk yaklaşan mülakat; yoksa null ("bugün" özeti). */
  nextInterview: z
    .strictObject({
      applicationId: z.uuid(),
      companyName: z.string(),
      positionTitle: z.string(),
      occurredAt: z.iso.datetime(),
    })
    .nullable(),
});
export type Stats = z.infer<typeof statsSchema>;

/** Oran: payda sıfırsa null (grafikte "veri yok"). */
export function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

// FR-14: hesap silme. Parola, (MFA açıksa) ikinci faktör ve e-postaya gönderilen silme kodu istenir.
const deletionBase = {
  password: z.string().min(1).max(128),
  confirm: z.literal('SİL'),
  emailCode: emailCodeSchema,
};
export const accountDeleteSchema = z.union([
  z.strictObject(deletionBase),
  z.strictObject({ ...deletionBase, code: totpCodeSchema }),
  z.strictObject({ ...deletionBase, recoveryCode: recoveryCodeSchema }),
]);
export type AccountDelete = z.infer<typeof accountDeleteSchema>;

// NFR-03: gerçek kullanıcı ölçümleri (web-vitals)
export const vitalsSchema = z.strictObject({
  name: z.enum(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']),
  value: z.number().nonnegative().max(600_000),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  /** Rota kalıbı (ID'ler ":id" ile değiştirilmiş), örn. "/basvurular/:id". */
  route: z
    .string()
    .max(100)
    .regex(/^\/[a-z0-9/:_-]*$/),
});
export type Vitals = z.infer<typeof vitalsSchema>;
