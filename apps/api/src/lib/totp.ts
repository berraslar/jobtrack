import { Secret, TOTP } from 'otpauth';

const PERIOD_SECONDS = 30;
const ISSUER = 'JobTrack';

function buildTotp(secretBase32: string, label = ''): TOTP {
  return new TOTP({
    issuer: ISSUER,
    label,
    secret: Secret.fromBase32(secretBase32),
    algorithm: 'SHA1',
    digits: 6,
    period: PERIOD_SECONDS,
  });
}

/** 160 bit rastgele TOTP gizli anahtarı (RFC 4226 önerisi). */
export function createTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpUri(secretBase32: string, email: string): string {
  return buildTotp(secretBase32, email).toString();
}

/**
 * Kodu doğrular; ±1 adım (30 sn) saat kaymasına izin verir.
 * Daha önce kullanılmış ya da daha eski bir adıma ait kod reddedilir (tekrar oynatma koruması, ASVS 6.5).
 * Başarılıysa kullanılan adımı döndürür; çağıran bunu saklamalıdır.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  lastUsedStep: number | null,
  nowMs: number = Date.now(),
): number | null {
  const delta = buildTotp(secretBase32).validate({ token: code, timestamp: nowMs, window: 1 });
  if (delta === null) return null;
  const step = Math.floor(nowMs / 1000 / PERIOD_SECONDS) + delta;
  if (lastUsedStep !== null && step <= lastUsedStep) return null;
  return step;
}

/** Testler ve kurulum ekranı için belirli bir andaki kodu üretir. */
export function generateTotp(secretBase32: string, nowMs: number = Date.now()): string {
  return buildTotp(secretBase32).generate({ timestamp: nowMs });
}
