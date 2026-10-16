import type { FastifyRequest } from 'fastify';
import { idParamSchema } from '@jobtrack/shared';
import { notFound, unauthorized } from './errors.js';

/** auth-guard'ın doğruladığı kullanıcı. Oturum yoksa erişim reddedilir (fail closed). */
export function requireUserId(request: FastifyRequest): string {
  if (!request.session || request.session.mfaPending) throw unauthorized();
  return request.session.userId;
}

/** Geçersiz biçimli ID de "bulunamadı" sayılır; var olan ve olmayan kayıt ayırt edilemez. */
export function parseId(params: unknown): string {
  const result = idParamSchema.safeParse(params);
  if (!result.success) throw notFound();
  return result.data.id;
}

/** PostgreSQL hata kodunu, Drizzle'ın sarmaladığı zincirde arar. */
export function pgErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  for (let i = 0; i < 4 && current instanceof Error; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = current.cause;
  }
  return undefined;
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
/** ON DELETE RESTRICT ihlali (23503'ten ayrı bir koddur). */
export const PG_RESTRICT_VIOLATION = '23001';

/** Date → ISO metni; null korunur. */
export const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

export type Defined<T> = { [K in keyof T]?: Exclude<T[K], undefined> };

/**
 * PATCH gövdesinden gönderilmemiş (`undefined`) alanları atar; `null` korunur.
 * Böylece "değiştirme" ile "temizle" ayrımı veritabanına doğru yansır.
 */
export function withoutUndefined<T extends object>(values: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Defined<T>;
}

/**
 * İndirme başlığı (RFC 6266). Eski istemciler için ASCII yedek ad, yenileri için UTF-8 ad.
 * `attachment`: dosya tarayıcıda bu sitenin kökeninde açılmaz, indirilir.
 */
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
