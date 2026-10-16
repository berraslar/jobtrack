import { eq } from 'drizzle-orm';
import type { ProfileUpdate } from '@jobtrack/shared';
import type { Tx } from '../../db/client.js';
import { profiles } from '../../db/schema.js';

export type ProfileRow = typeof profiles.$inferSelect;

export async function getProfile(tx: Tx): Promise<ProfileRow | null> {
  // RLS yalnızca oturumdaki kullanıcının satırını gösterir; tabloda kullanıcı başına tek satır var.
  const rows = await tx.select().from(profiles);
  return rows[0] ?? null;
}

/** Profili bütün olarak yazar (ilk kayıtta ekler, sonra değiştirir). */
export async function putProfile(
  tx: Tx,
  userId: string,
  values: ProfileUpdate,
  now: Date,
): Promise<ProfileRow> {
  const row = { ...values, updatedAt: now };
  const rows = await tx
    .insert(profiles)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: profiles.userId, set: row })
    .returning();
  const saved = rows[0];
  if (!saved) throw new Error('Profil kaydedilemedi');
  return saved;
}

export async function deleteProfile(tx: Tx, userId: string): Promise<void> {
  await tx.delete(profiles).where(eq(profiles.userId, userId));
}
