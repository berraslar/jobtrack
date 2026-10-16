import { describe, expect, it, vi } from 'vitest';
import { AttemptLimiter } from './attempt-limiter.js';
import { decrypt, deriveKey, encrypt, safeEqual } from './crypto.js';
import { createPwnedChecker, hashPassword, verifyPassword } from './password.js';
import { createTotpSecret, generateTotp, verifyTotp } from './totp.js';

const key = Buffer.alloc(32, 7);

describe('AES-256-GCM (A04)', () => {
  it('şifreleyip geri çözer', () => {
    expect(decrypt(key, encrypt(key, 'gizli', 'kullanici-a'), 'kullanici-a')).toBe('gizli');
  });

  it('başka bir kullanıcının bağlamında çözülemez (AAD)', () => {
    const payload = encrypt(key, 'gizli', 'kullanici-a');
    expect(() => decrypt(key, payload, 'kullanici-b')).toThrow();
  });

  it('değiştirilmiş şifreli metni reddeder', () => {
    const payload = encrypt(key, 'gizli', 'a');
    const last = payload.at(-1) === 'A' ? 'B' : 'A';
    expect(() => decrypt(key, payload.slice(0, -1) + last, 'a')).toThrow();
  });

  it('aynı metni her seferinde farklı şifreler (rastgele IV)', () => {
    expect(encrypt(key, 'x', 'a')).not.toBe(encrypt(key, 'x', 'a'));
  });
});

describe('deriveKey / safeEqual', () => {
  it('farklı amaçlar için farklı anahtar türetir', () => {
    expect(deriveKey(key, 'csrf').equals(deriveKey(key, 'ip'))).toBe(false);
  });

  it('eşitliği doğru karşılaştırır', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('Argon2id (A04)', () => {
  it('OWASP ayarlarıyla Argon2id hash üretir', async () => {
    const hash = await hashPassword('uzun-bir-parola-123');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'uzun-bir-parola-123')).toBe(true);
    expect(await verifyPassword(hash, 'yanlis-parola-1234')).toBe(false);
  });

  it('bozuk hash ile hata fırlatmaz, reddeder (fail closed)', async () => {
    expect(await verifyPassword('bozuk', 'x')).toBe(false);
  });
});

describe('HIBP k-anonimlik denetimi', () => {
  // "password" kelimesinin SHA-1'i: 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
  const response = (body: string, ok = true) =>
    vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: ok ? 200 : 503 }));

  it('yalnızca hash önekini gönderir ve eşleşmeyi bulur', async () => {
    const fetchMock = response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:3861493\r\nABC:0');
    expect(await createPwnedChecker(fetchMock)('password')).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');
  });

  it('dolgu satırlarını (sayı 0) eşleşme saymaz', async () => {
    expect(
      await createPwnedChecker(response('1E4C9B93F3F0682250B6CF8331B7EE68FD8:0'))('password'),
    ).toBe(false);
  });

  it('servis hatasında null döner', async () => {
    expect(await createPwnedChecker(response('', false))('password')).toBeNull();
    const failing = vi.fn<typeof fetch>().mockRejectedValue(new Error('ağ yok'));
    expect(await createPwnedChecker(failing)('password')).toBeNull();
  });
});

describe('TOTP', () => {
  const secret = createTotpSecret();
  const now = Date.UTC(2026, 9, 6, 12, 0, 15);

  it('geçerli kodu kabul eder ve adımı döndürür', () => {
    expect(verifyTotp(secret, generateTotp(secret, now), null, now)).toBe(Math.floor(now / 30_000));
  });

  it('30 saniyelik saat kaymasını tolere eder', () => {
    expect(verifyTotp(secret, generateTotp(secret, now - 30_000), null, now)).not.toBeNull();
  });

  it('60 saniye eski kodu reddeder', () => {
    expect(verifyTotp(secret, generateTotp(secret, now - 60_000), null, now)).toBeNull();
  });

  it('aynı kodun tekrar kullanımını reddeder (replay)', () => {
    const code = generateTotp(secret, now);
    const step = verifyTotp(secret, code, null, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, code, step, now)).toBeNull();
  });
});

describe('AttemptLimiter', () => {
  it('pencere içinde sınıra ulaşınca engeller, pencere geçince açar', () => {
    let t = 0;
    const limiter = new AttemptLimiter(3, 1000, () => t);
    for (let i = 0; i < 3; i++) limiter.fail('a');
    expect(limiter.isBlocked('a')).toBe(true);
    expect(limiter.isBlocked('b')).toBe(false);
    t = 1001;
    expect(limiter.isBlocked('a')).toBe(false);
  });

  it('anahtar sayısı sınırı aşılınca belleği büyütmez (DoS)', () => {
    let t = 0;
    const limiter = new AttemptLimiter(5, 1000, () => t, 100);
    for (let i = 0; i < 1000; i++) limiter.fail(`saldirgan-${String(i)}@example.com`);
    expect(limiter.size).toBeLessThanOrEqual(100);
    // Süresi dolmuş kayıtlar önce temizlenir; güncel kayıt korunur.
    t = 2000;
    limiter.fail('kurban@example.com');
    expect(limiter.size).toBe(1);
  });

  it('reset sayacı sıfırlar', () => {
    const limiter = new AttemptLimiter(1, 1000);
    limiter.fail('a');
    limiter.reset('a');
    expect(limiter.isBlocked('a')).toBe(false);
  });
});
