import { hash, verify } from '@node-rs/argon2';
import { createHash } from 'node:crypto';

/**
 * Argon2id, OWASP Password Storage Cheat Sheet'in önerdiği minimum ayarlar (A04):
 * 19 MiB bellek, 2 iterasyon, 1 paralellik. Kütüphanenin varsayılan algoritması Argon2id'dir.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Bozuk hash: erişim reddedilir (fail closed).
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Var olmayan bir hesap için de aynı süreli Argon2 doğrulaması yapılır;
 * yanıt süresi hesabın var olup olmadığını belli etmez (A07).
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('jobtrack-zamanlama-esitleme');
  await verifyPassword(await dummyHash, password);
  return false;
}

export type PwnedChecker = (password: string) => Promise<boolean | null>;

/**
 * Have I Been Pwned "Pwned Passwords" k-anonimlik sorgusu (A07, ADR-0003).
 * Yalnızca SHA-1 hash'in ilk 5 karakteri gönderilir. Servise ulaşılamazsa `null` döner.
 */
export function createPwnedChecker(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 3000,
): PwnedChecker {
  return async (password) => {
    // SHA-1 burada güvenlik amacıyla değil, HIBP API'sinin anahtar biçimi olduğu için kullanılır.
    const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    try {
      const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true', 'User-Agent': 'JobTrack' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return null;
      const body = await res.text();
      return body.split('\n').some((line) => {
        const [hashSuffix, count] = line.trim().split(':');
        return hashSuffix === suffix && Number(count) > 0;
      });
    } catch {
      return null;
    }
  };
}
