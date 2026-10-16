import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { settingsUpdateSchema, type Settings } from '@jobtrack/shared';
import { withUserTx, type Db, type Tx } from '../../db/client.js';
import { users } from '../../db/schema.js';
import { notFound } from '../../lib/errors.js';
import { requireUserId } from '../../lib/http.js';

// Küçük modül: servis katmanı iş kuralı taşımadığı için rota doğrudan repository'yi çağırır.

async function readSettings(tx: Tx, userId: string): Promise<Settings> {
  const rows = await tx
    .select({ followUpDays: users.followUpDays, locale: users.locale })
    .from(users)
    .where(eq(users.id, userId));
  const row = rows[0];
  if (!row) throw notFound();
  return row;
}

export async function settingsRoutes(app: FastifyInstance, opts: { db: Db }) {
  app.get('/', async (request): Promise<Settings> => {
    const userId = requireUserId(request);
    return withUserTx(opts.db, userId, (tx) => readSettings(tx, userId));
  });

  app.patch('/', async (request): Promise<Settings> => {
    const userId = requireUserId(request);
    const input = settingsUpdateSchema.parse(request.body);
    return withUserTx(opts.db, userId, async (tx) => {
      await tx
        .update(users)
        .set({
          ...(input.followUpDays !== undefined ? { followUpDays: input.followUpDays } : {}),
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      return readSettings(tx, userId);
    });
  });
}
