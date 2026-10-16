import { describe, expect, it } from 'vitest';
import {
  loginRequestSchema,
  mfaVerifyRequestSchema,
  recoveryCodeSchema,
  registerRequestSchema,
} from './auth.js';

describe('registerRequestSchema', () => {
  it('e-postayı küçük harfe çevirir ve kırpar', () => {
    const parsed = registerRequestSchema.parse({
      email: '  Berra@Example.COM ',
      password: 'uzun-bir-parola-123',
    });
    expect(parsed.email).toBe('berra@example.com');
  });

  it('12 karakterden kısa parolayı reddeder', () => {
    expect(registerRequestSchema.safeParse({ email: 'a@b.co', password: 'kisa' }).success).toBe(
      false,
    );
  });

  it('128 karakterden uzun parolayı reddeder', () => {
    const password = 'a'.repeat(129);
    expect(registerRequestSchema.safeParse({ email: 'a@b.co', password }).success).toBe(false);
  });

  it('tanımsız alanları reddeder (mass assignment)', () => {
    const result = registerRequestSchema.safeParse({
      email: 'a@b.co',
      password: 'uzun-bir-parola-123',
      isAdmin: true,
    });
    expect(result.success).toBe(false);
  });
});

describe('loginRequestSchema', () => {
  it('girişte kısa parolaya izin verir (eski parolalar kilitlenmesin)', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });
});

describe('mfaVerifyRequestSchema', () => {
  it('6 haneli kodu kabul eder', () => {
    expect(mfaVerifyRequestSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it('kurtarma kodunu kabul eder', () => {
    expect(mfaVerifyRequestSchema.safeParse({ recoveryCode: 'ab3k9-x7m2q' }).success).toBe(true);
  });

  it('ikisi birden gönderilirse reddeder', () => {
    expect(
      mfaVerifyRequestSchema.safeParse({ code: '123456', recoveryCode: 'ab3k9-x7m2q' }).success,
    ).toBe(false);
  });
});

describe('recoveryCodeSchema', () => {
  it('tiresiz ve büyük harfli yazımı kabul eder', () => {
    expect(recoveryCodeSchema.parse('AB3K9X7M2Q')).toBe('ab3k9x7m2q');
  });
});
