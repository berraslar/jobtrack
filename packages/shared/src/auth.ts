import { z } from 'zod';
import { localeSchema } from './domain.js';

/** Parola kuralları (A07, ASVS 6.2): en az 12, en fazla 128 karakter; karmaşıklık kuralı yok. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Geçerli bir e-posta adresi girin.' }));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    error: `Parola en az ${String(PASSWORD_MIN_LENGTH)} karakter olmalı.`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `Parola en fazla ${String(PASSWORD_MAX_LENGTH)} karakter olabilir.`,
  });

export const registerRequestSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  /** FR-16: kayıt ekranında seçili dil hesabın dili olur; verilmezse Türkçe. */
  locale: localeSchema.optional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  // Girişte uzunluk kuralı uygulanmaz; yalnızca üst sınır (DoS koruması).
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const totpCodeSchema = z.string().regex(/^\d{6}$/, { error: '6 haneli kodu girin.' });

/** ADR-0007: e-postayla gönderilen 6 haneli kod. Boşluklar (kopyala-yapıştır) temizlenir. */
export const emailCodeSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, { error: '6 haneli kodu girin.' }));

export const emailVerifyRequestSchema = z.strictObject({ code: emailCodeSchema });
export type EmailVerifyRequest = z.infer<typeof emailVerifyRequestSchema>;

/** Kodun kalan süresi ve yeniden gönderme beklemesi (saniye). */
export const emailCodeTimingSchema = z.strictObject({
  expiresInSeconds: z.number().int().nonnegative(),
  resendInSeconds: z.number().int().nonnegative(),
});
export type EmailCodeTiming = z.infer<typeof emailCodeTimingSchema>;

/** Kurtarma kodu: 10 karakter, okunabilirlik için tire ile ikiye bölünmüş (örn. "ab3k9-x7m2q"). */
export const recoveryCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{5}-?[a-z0-9]{5}$/, { error: 'Kurtarma kodu biçimi geçersiz.' });

export const mfaVerifyRequestSchema = z.union([
  z.strictObject({ code: totpCodeSchema }),
  z.strictObject({ recoveryCode: recoveryCodeSchema }),
]);
export type MfaVerifyRequest = z.infer<typeof mfaVerifyRequestSchema>;

/** MFA'yı açmak bir kimlik doğrulama yöntemi değişikliğidir; mevcut parola yeniden istenir (ASVS L2). */
export const mfaEnableRequestSchema = z.strictObject({
  code: totpCodeSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type MfaEnableRequest = z.infer<typeof mfaEnableRequestSchema>;

// Yanıtlar

export const meResponseSchema = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  mfaEnabled: z.boolean(),
  locale: localeSchema,
  csrfToken: z.string(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const loginResponseSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('mfa_required') }),
  /** TOTP kapalı hesapta yeni cihaz ya da doğrulanmamış e-posta: e-postaya kod gönderildi. */
  emailCodeTimingSchema.extend({ status: z.literal('email_required') }),
  z.strictObject({
    status: z.literal('ok'),
    /** Son başarılı girişten bu yana başarısız giriş sayısı (ADR-0003: e-posta yerine uygulama içi uyarı). */
    failedAttemptsSinceLastLogin: z.number().int().nonnegative(),
  }),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const mfaSetupResponseSchema = z.strictObject({
  otpauthUri: z.string(),
  qrDataUrl: z.string(),
});
export type MfaSetupResponse = z.infer<typeof mfaSetupResponseSchema>;

export const mfaEnableResponseSchema = z.strictObject({
  recoveryCodes: z.array(z.string()),
});
export type MfaEnableResponse = z.infer<typeof mfaEnableResponseSchema>;

export const sessionInfoSchema = z.strictObject({
  id: z.uuid(),
  userAgent: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof sessionInfoSchema>;

export const sessionsResponseSchema = z.strictObject({ sessions: z.array(sessionInfoSchema) });
export type SessionsResponse = z.infer<typeof sessionsResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.string(),
  traceId: z.string(),
  code: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
