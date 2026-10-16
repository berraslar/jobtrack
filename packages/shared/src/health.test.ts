import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('geçerli yanıtı kabul eder', () => {
    expect(healthResponseSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('tanımsız alanları reddeder (A06 mass assignment koruması)', () => {
    expect(() => healthResponseSchema.parse({ status: 'ok', version: '1.0.0' })).toThrow();
  });
});
