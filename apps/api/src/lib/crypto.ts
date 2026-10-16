import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/** URL güvenli, rastgele token. Varsayılan 256 bit (A07 oturum ID'si). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function hmacSha256(key: Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

/** Sabit zamanlı karşılaştırma; uzunluk farkı erken döner (uzunluk gizli değildir). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Tek bir ana sırdan amaca özel alt anahtar türetir (HKDF-SHA256). */
export function deriveKey(secret: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), purpose, 32));
}

const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const VERSION = 'v1';

/**
 * AES-256-GCM ile şifreler (A04). `aad` şifreli metni bir bağlama (örn. kullanıcı ID'si) bağlar;
 * başka bir kullanıcının satırına kopyalanan şifreli değer çözülemez.
 */
export function encrypt(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}.${Buffer.concat([iv, tag, ciphertext]).toString('base64url')}`;
}

export function decrypt(key: Buffer, payload: string, aad: string): string {
  const [version, body] = payload.split('.');
  if (version !== VERSION || body === undefined)
    throw new Error('Desteklenmeyen şifreli veri biçimi');
  const raw = Buffer.from(body, 'base64url');
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = raw.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(CIPHER, key, iv);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
