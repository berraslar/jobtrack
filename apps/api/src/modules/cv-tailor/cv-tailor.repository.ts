import { desc, eq, sql } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import { applications, companies, masterCvs, tailoredCvs } from '../../db/schema.js';

// FR-23 (ADR-0010). Tüm sorgular RLS altındadır: başkasının satırı "yok" görünür.

export type MasterCvRow = typeof masterCvs.$inferSelect;

export async function getMasterCv(tx: Tx): Promise<MasterCvRow | null> {
  const rows = await tx.select().from(masterCvs);
  return rows[0] ?? null;
}

export async function putMasterCv(
  tx: Tx,
  userId: string,
  markdown: string,
  now: Date,
): Promise<MasterCvRow> {
  const rows = await tx
    .insert(masterCvs)
    .values({ userId, markdown, updatedAt: now })
    .onConflictDoUpdate({ target: masterCvs.userId, set: { markdown, updatedAt: now } })
    .returning();
  const saved = rows[0];
  if (!saved) throw new Error('Ana CV kaydedilemedi');
  return saved;
}

/** Başvurunun ilan metni; başvuru yoksa (ya da başkasınınsa) `undefined`. */
export async function getJobDescription(
  tx: Tx,
  applicationId: string,
): Promise<{ jobDescription: string | null } | undefined> {
  const rows = await tx
    .select({ jobDescription: applications.jobDescription })
    .from(applications)
    .where(eq(applications.id, applicationId));
  return rows[0];
}

/** İlan metnini yazar. Başvurunun güncellenme zamanına dokunmaz (takip hesabı etkilenmez). */
export async function setJobDescription(
  tx: Tx,
  applicationId: string,
  jobDescription: string | null,
): Promise<{ jobDescription: string | null } | undefined> {
  const rows = await tx
    .update(applications)
    .set({ jobDescription })
    .where(eq(applications.id, applicationId))
    .returning({ jobDescription: applications.jobDescription });
  return rows[0];
}

/** Uyarlama için başvurunun pozisyonu, şirket adı ve ilan metni. */
export async function getTailorContext(tx: Tx, applicationId: string) {
  const rows = await tx
    .select({
      positionTitle: applications.positionTitle,
      companyName: companies.name,
      jobDescription: applications.jobDescription,
    })
    .from(applications)
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .where(eq(applications.id, applicationId));
  return rows[0];
}

// Uyarlanmış CV sürümleri (FR-24)

export type TailoredCvRow = typeof tailoredCvs.$inferSelect;

export async function applicationExists(tx: Tx, applicationId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: applications.id })
    .from(applications)
    .where(eq(applications.id, applicationId));
  return rows.length > 0;
}

export function listTailoredCvs(tx: Tx, applicationId?: string): Promise<TailoredCvRow[]> {
  const query = tx.select().from(tailoredCvs);
  return (
    applicationId ? query.where(eq(tailoredCvs.applicationId, applicationId)) : query
  ).orderBy(desc(tailoredCvs.createdAt));
}

export async function getTailoredCv(tx: Tx, id: string): Promise<TailoredCvRow | undefined> {
  const rows = await tx.select().from(tailoredCvs).where(eq(tailoredCvs.id, id));
  return rows[0];
}

export async function insertTailoredCv(
  tx: Tx,
  values: Omit<TailoredCvRow, 'id' | 'createdAt' | 'updatedAt'>,
  now: Date,
): Promise<TailoredCvRow> {
  const rows = await tx
    .insert(tailoredCvs)
    .values({ id: sql`uuidv7()`, ...values, createdAt: now, updatedAt: now })
    .returning();
  const saved = rows[0];
  if (!saved) throw new Error('CV sürümü kaydedilemedi');
  return saved;
}

export async function updateTailoredCv(
  tx: Tx,
  id: string,
  markdown: string,
  now: Date,
): Promise<TailoredCvRow | undefined> {
  const rows = await tx
    .update(tailoredCvs)
    .set({ markdown, updatedAt: now })
    .where(eq(tailoredCvs.id, id))
    .returning();
  return rows[0];
}

export async function deleteTailoredCv(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx
    .delete(tailoredCvs)
    .where(eq(tailoredCvs.id, id))
    .returning({ id: tailoredCvs.id });
  return rows.length > 0;
}
