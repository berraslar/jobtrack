import { z } from 'zod';

/** GET /api/health yanıtı. Ayrıntı (sürüm, bağımlılık durumu) dışarı sızdırılmaz (A02). */
export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
