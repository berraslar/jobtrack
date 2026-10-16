import { asc, count, eq, getTableColumns, sql } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import { applications, companies } from '../../db/schema.js';

export type CompanyRow = typeof companies.$inferSelect & { applicationCount: number };

const withCount = {
  ...getTableColumns(companies),
  applicationCount: count(applications.id),
};

export async function listCompanies(tx: Tx): Promise<CompanyRow[]> {
  return tx
    .select(withCount)
    .from(companies)
    .leftJoin(applications, eq(applications.companyId, companies.id))
    .groupBy(companies.id)
    .orderBy(asc(sql`lower(${companies.name})`));
}

export async function getCompany(tx: Tx, id: string): Promise<CompanyRow | null> {
  const rows = await tx
    .select(withCount)
    .from(companies)
    .leftJoin(applications, eq(applications.companyId, companies.id))
    .where(eq(companies.id, id))
    .groupBy(companies.id);
  return rows[0] ?? null;
}

/** Büyük/küçük harf duyarsız ad araması (benzersiz indeks lower(name) üzerindedir). */
export async function findCompanyIdByName(tx: Tx, name: string): Promise<string | null> {
  const rows = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(sql`lower(${companies.name}) = lower(${name})`)
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function insertCompany(
  tx: Tx,
  values: {
    userId: string;
    name: string;
    sector: string | null;
    website: string | null;
    notes: string | null;
  },
): Promise<string> {
  const now = new Date();
  const rows = await tx
    .insert(companies)
    .values({ id: sql`uuidv7()`, ...values, createdAt: now, updatedAt: now })
    .returning({ id: companies.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('şirket oluşturulamadı');
  return id;
}

export async function updateCompany(
  tx: Tx,
  id: string,
  values: Partial<Pick<typeof companies.$inferInsert, 'name' | 'sector' | 'website' | 'notes'>>,
): Promise<boolean> {
  const rows = await tx
    .update(companies)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(companies.id, id))
    .returning({ id: companies.id });
  return rows.length > 0;
}

export async function deleteCompany(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx
    .delete(companies)
    .where(eq(companies.id, id))
    .returning({ id: companies.id });
  return rows.length > 0;
}
