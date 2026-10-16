import { describe, expect, it } from 'vitest';
import { ExtractError, extractText, MAX_BYTES } from './extract.js';

describe('extractText (ADR-0008)', () => {
  it('PDF imzası olmayan içeriği araç çalıştırmadan reddeder', async () => {
    await expect(extractText(Buffer.from('<html>cv</html>'))).rejects.toMatchObject({
      code: 'not_pdf',
    });
  });

  it('5 MB üstünü reddeder', async () => {
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(MAX_BYTES)]);
    const err: unknown = await extractText(big).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExtractError);
    expect((err as ExtractError).code).toBe('too_large');
  });
});
