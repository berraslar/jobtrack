import { z } from 'zod';

/** Base64 ile kodlanmış, en az `minBytes` uzunluğunda gizli anahtar. */
const base64Key = (minBytes: number, exactBytes?: number) =>
  z
    .string()
    .transform((value) => Buffer.from(value, 'base64'))
    .refine(
      (buf) => buf.length >= minBytes && (exactBytes === undefined || buf.length === exactBytes),
      {
        error: exactBytes
          ? `Tam olarak ${String(exactBytes)} baytlık base64 anahtar olmalı.`
          : `En az ${String(minBytes)} baytlık base64 anahtar olmalı.`,
      },
    );

/** Compose boş bırakılan değişkeni boş metin olarak geçirir; boş metin "tanımsız" sayılır. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /** Uygulama rolüyle (jobtrack_app) bağlantı. RLS altında çalışır. */
    DATABASE_URL: z.url(),
    /** Tarayıcının gördüğü köken; durum değiştiren isteklerde Origin başlığı bununla karşılaştırılır (A08). */
    APP_ORIGIN: z.url().transform((url) => new URL(url).origin),
    /** CSRF token'ı ve IP hash'i için anahtar türetme kaynağı. */
    APP_SECRET: base64Key(32),
    /** TOTP gizli anahtarlarını şifreleyen AES-256-GCM anahtarı (A04). */
    DATA_ENCRYPTION_KEY: base64Key(32, 32),

    /** "Bugün" hesapları (örn. başvuru tarihi) için kullanıcının saat dilimi. */
    APP_TIMEZONE: z
      .string()
      .default('Europe/Istanbul')
      .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz) || tz === 'UTC', {
        error: 'Geçerli bir IANA saat dilimi olmalı.',
      }),

    REGISTRATION_ENABLED: z.stringbool().default(false),
    HIBP_ENABLED: z.stringbool().default(true),
    /** Yalnızca HTTPS olmayan, localhost dışı bir geliştirme ortamında false yapılır. */
    COOKIE_SECURE: z.stringbool().default(true),

    /**
     * ADR-0007: doğrulama kodları SMTP ile gönderilir (Gmail: smtp.gmail.com, 465, uygulama şifresi).
     * Testler dışında zorunludur; e-posta gönderilemeyen bir kurulum kullanıcıyı içeri alamaz.
     */
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
    SMTP_SECURE: z.stringbool().default(true),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    MAIL_FROM: z.string().min(3).default('JobTrack <no-reply@localhost>'),

    /** ADR-0008: iç ağdaki CV ayrıştırıcı. Tanımsızsa "CV'den doldur" kapalıdır. */
    CV_PARSER_URL: z.url({ protocol: /^https?$/ }).optional(),

    /**
     * ADR-0010: yapay zekâ ile CV uyarlama sağlayıcısı. Tanımsızsa özellik kapalıdır (varsayılan).
     * `fake` yalnızca testlerde seçilebilir; veri sunucudan çıkmaz.
     */
    AI_PROVIDER: z.preprocess(emptyAsUndefined, z.enum(['gemini', 'fake']).optional()),
    /** Yalnızca API sürecinde kalır; istemciye hiçbir yanıtla gitmez, loglanmaz (A02, A04). */
    GEMINI_API_KEY: z.preprocess(emptyAsUndefined, z.string().min(1).optional()),
    /** Ücretsiz katmanı olan güncel kararlı Flash modeli (2026-10-14'te doğrulandı, ADR-0010). */
    GEMINI_MODEL: z.preprocess(
      emptyAsUndefined,
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9.-]{1,63}$/, { error: 'Geçerli bir Gemini model adı olmalı.' })
        .default('gemini-3.8-flash'),
    ),
    /**
     * Ana model yoğunken (503) sırayla denenen yedekler; virgülle ayrılır, boş liste yedeği kapatır.
     * Aynı sağlayıcı ve koşullar geçerlidir (2026-10-16'da bu anahtarla erişilebildiği doğrulandı).
     */
    GEMINI_FALLBACK_MODELS: z.preprocess(
      (value) =>
        typeof value === 'string'
          ? value
              .split(',')
              .map((model) => model.trim())
              .filter(Boolean)
          : value,
      z
        .array(
          z.string().regex(/^[a-z0-9][a-z0-9.-]{1,63}$/, {
            error: 'Geçerli bir Gemini model adı olmalı.',
          }),
        )
        .max(4)
        .default(['gemini-3.7-flash', 'gemini-3.5-flash-lite']),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'AI_PROVIDER=gemini için GEMINI_API_KEY zorunlu (ADR-0010).',
      });
    }
    if (env.AI_PROVIDER === 'fake' && env.NODE_ENV !== 'test') {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message: 'Sahte yapay zekâ sağlayıcısı yalnızca testlerde kullanılabilir.',
      });
    }
    if (env.NODE_ENV !== 'test' && !env.SMTP_HOST) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST zorunlu (ADR-0007).',
      });
    }
  });

export type Config = z.infer<typeof envSchema>;

/** Yapılandırma yalnızca ortam değişkenlerinden okunur (12-Factor). Geçersizse uygulama başlamaz (fail closed). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Geçersiz ortam değişkenleri: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
