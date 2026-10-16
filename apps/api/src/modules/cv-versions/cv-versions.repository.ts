import { asc, count, eq, getTableColumns, sql } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import { applications, cvFiles, cvVersions } from '../../db/schema.js';

export type CvVersionRow = typeof cvVersions.$inferSelect & {
  applicationCount: number;
  fileSizeBytes: number | null;
  fileUploadedAt: Date | null;
};

// Dosyanın yalnızca boyutu ve tarihi okunur; baytlar listede hiç yüklenmez.
const withCount = {
  ...getTableColumns(cvVersions),
  applicationCount: count(applications.id),
  fileSizeBytes: cvFiles.sizeBytes,
  fileUploadedAt: cvFiles.uploadedAt,
};

export async function listCvVersions(tx: Tx): Promise<CvVersionRow[]> {
  return tx
    .select(withCount)
    .from(cvVersions)
    .leftJoin(applications, eq(applications.cvVersionId, cvVersions.id))
    .leftJoin(cvFiles, eq(cvFiles.cvVersionId, cvVersions.id))
    .groupBy(cvVersions.id, cvFiles.cvVersionId)
    .orderBy(asc(sql`lower(${cvVersions.label})`));
}

export async function getCvVersion(tx: Tx, id: string): Promise<CvVersionRow | null> {
  const rows = await tx
    .select(withCount)
    .from(cvVersions)
    .leftJoin(applications, eq(applications.cvVersionId, cvVersions.id))
    .leftJoin(cvFiles, eq(cvFiles.cvVersionId, cvVersions.id))
    .where(eq(cvVersions.id, id))
    .groupBy(cvVersions.id, cvFiles.cvVersionId);
  return rows[0] ?? null;
}

export async function insertCvVersion(
  tx: Tx,
  values: { userId: string; label: string; fileName: string | null },
): Promise<string> {
  const rows = await tx
    .insert(cvVersions)
    .values({ id: sql`uuidv7()`, ...values, createdAt: new Date() })
    .returning({ id: cvVersions.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('CV versiyonu oluşturulamadı');
  return id;
}

export async function updateCvVersion(
  tx: Tx,
  id: string,
  values: Partial<Pick<typeof cvVersions.$inferInsert, 'label' | 'fileName'>>,
): Promise<boolean> {
  if (Object.keys(values).length === 0) {
    return (await getCvVersion(tx, id)) !== null;
  }
  const rows = await tx
    .update(cvVersions)
    .set(values)
    .where(eq(cvVersions.id, id))
    .returning({ id: cvVersions.id });
  return rows.length > 0;
}

export async function deleteCvVersion(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx
    .delete(cvVersions)
    .where(eq(cvVersions.id, id))
    .returning({ id: cvVersions.id });
  return rows.length > 0;
}

/** Versiyonun dosyasını ekler ya da değiştirir; gösterilen dosya adı da güncellenir. */
export async function putCvFile(
  tx: Tx,
  values: { cvVersionId: string; userId: string; fileName: string; data: Buffer },
): Promise<void> {
  const file = {
    fileName: values.fileName,
    contentType: 'application/pdf',
    sizeBytes: values.data.length,
    data: values.data,
    uploadedAt: new Date(),
  };
  await tx
    .insert(cvFiles)
    .values({ cvVersionId: values.cvVersionId, userId: values.userId, ...file })
    .onConflictDoUpdate({ target: cvFiles.cvVersionId, set: file });
  await tx
    .update(cvVersions)
    .set({ fileName: values.fileName })
    .where(eq(cvVersions.id, values.cvVersionId));
}

export async function getCvFile(
  tx: Tx,
  cvVersionId: string,
): Promise<{ fileName: string; contentType: string; data: Buffer } | null> {
  const rows = await tx
    .select({ fileName: cvFiles.fileName, contentType: cvFiles.contentType, data: cvFiles.data })
    .from(cvFiles)
    .where(eq(cvFiles.cvVersionId, cvVersionId));
  return rows[0] ?? null;
}

export async function deleteCvFile(tx: Tx, cvVersionId: string): Promise<boolean> {
  const rows = await tx
    .delete(cvFiles)
    .where(eq(cvFiles.cvVersionId, cvVersionId))
    .returning({ id: cvFiles.cvVersionId });
  return rows.length > 0;
}
