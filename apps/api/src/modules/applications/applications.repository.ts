import type { ApplicationListQuery, ApplicationStage } from '@jobtrack/shared';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  not,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import {
  activities,
  applications,
  companies,
  cvVersions,
  stageHistory,
  users,
} from '../../db/schema.js';

export type ApplicationValues = Partial<
  Pick<
    typeof applications.$inferInsert,
    | 'companyId'
    | 'cvVersionId'
    | 'positionTitle'
    | 'jobUrl'
    | 'source'
    | 'location'
    | 'workMode'
    | 'salaryExpectation'
    | 'appliedAt'
    | 'notes'
  >
>;

const applicationColumns = {
  id: applications.id,
  companyId: applications.companyId,
  companyName: companies.name,
  cvVersionId: applications.cvVersionId,
  cvVersionLabel: cvVersions.label,
  positionTitle: applications.positionTitle,
  jobUrl: applications.jobUrl,
  source: applications.source,
  location: applications.location,
  workMode: applications.workMode,
  salaryExpectation: applications.salaryExpectation,
  currentStage: applications.currentStage,
  appliedAt: applications.appliedAt,
  archivedAt: applications.archivedAt,
  notes: applications.notes,
  createdAt: applications.createdAt,
  updatedAt: applications.updatedAt,
};

/** Son temas: oluşturma, başvuru tarihi, son aşama değişikliği ve son etkinlikten en yenisi. */
const lastActivity = sql`greatest(
  ${applications.createdAt},
  ${applications.appliedAt}::timestamptz,
  (select max(sh.changed_at) from ${stageHistory} sh where sh.application_id = ${applications.id}),
  (select max(ac.occurred_at) from ${activities} ac where ac.application_id = ${applications.id})
)`;

/** Takip yalnızca süren başvurular için anlamlıdır: kaydedilmiş ve kapanmış olanlar hariç. */
const FOLLOW_UP_EXCLUDED_STAGES = ['saved', 'accepted', 'rejected', 'no_response', 'withdrawn'];

/** FR-11: süren, arşivlenmemiş ve son temasın üzerinden kullanıcının gün sayısı geçmiş başvuru. */
export function needsFollowUp(now: Date): SQL<boolean> {
  return sql<boolean>`(
    ${applications.currentStage} not in (${sql.join(
      FOLLOW_UP_EXCLUDED_STAGES.map((stage) => sql`${stage}`),
      sql`, `,
    )})
    and ${applications.archivedAt} is null
    and ${lastActivity} < ${now.toISOString()}::timestamptz - make_interval(days => (
      select u.follow_up_days from ${users} u where u.id = ${applications.userId}
    ))
  )`;
}

function baseQuery(tx: Tx, now: Date) {
  return tx
    .select({
      ...applicationColumns,
      // Sürücü zaman damgalarını metin döndürdüğü için milisaniye olarak alınır.
      lastActivityMs: sql<number>`(extract(epoch from ${lastActivity}) * 1000)::float8`.mapWith(
        Number,
      ),
      needsFollowUp: needsFollowUp(now).mapWith(
        (value: unknown) => value === true || value === 't',
      ),
    })
    .from(applications)
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .leftJoin(cvVersions, eq(cvVersions.id, applications.cvVersionId));
}

export type ApplicationRow = Awaited<ReturnType<typeof listApplications>>[number];

/** LIKE özel karakterlerini kaçışlar; kullanıcının yazdığı % veya _ joker olarak çalışmaz. */
function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** FR-10: arama ve filtreler. Tüm değerler parametre olarak gönderilir (A05). */
export async function listApplications(tx: Tx, query: ApplicationListQuery, now: Date) {
  const conditions: (SQL | undefined)[] = [];
  if (query.archived === 'exclude') conditions.push(isNull(applications.archivedAt));
  if (query.archived === 'only') conditions.push(isNotNull(applications.archivedAt));
  if (query.q) {
    const pattern = likePattern(query.q);
    conditions.push(or(ilike(applications.positionTitle, pattern), ilike(companies.name, pattern)));
  }
  if (query.stage) conditions.push(eq(applications.currentStage, query.stage));
  if (query.source) conditions.push(eq(applications.source, query.source));
  if (query.cvVersionId) conditions.push(eq(applications.cvVersionId, query.cvVersionId));
  if (query.companyId) conditions.push(eq(applications.companyId, query.companyId));
  if (query.appliedFrom) conditions.push(gte(applications.appliedAt, query.appliedFrom));
  if (query.appliedTo) conditions.push(lte(applications.appliedAt, query.appliedTo));
  if (query.followUp !== undefined) {
    conditions.push(query.followUp ? needsFollowUp(now) : not(needsFollowUp(now)));
  }
  return baseQuery(tx, now)
    .where(and(...conditions))
    .orderBy(desc(applications.updatedAt));
}

export async function getApplication(
  tx: Tx,
  id: string,
  now: Date,
): Promise<ApplicationRow | null> {
  const rows = await baseQuery(tx, now).where(eq(applications.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function insertApplication(
  tx: Tx,
  values: ApplicationValues & { userId: string; companyId: string; positionTitle: string },
): Promise<string> {
  const now = new Date();
  const rows = await tx
    .insert(applications)
    .values({
      id: sql`uuidv7()`,
      ...values,
      currentStage: values.appliedAt ? 'applied' : 'saved',
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: applications.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('başvuru oluşturulamadı');
  return id;
}

export async function updateApplication(
  tx: Tx,
  id: string,
  values: ApplicationValues & {
    currentStage?: ApplicationStage;
    archivedAt?: Date | null;
  },
): Promise<boolean> {
  const rows = await tx
    .update(applications)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(applications.id, id))
    .returning({ id: applications.id });
  return rows.length > 0;
}

export async function deleteApplication(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx
    .delete(applications)
    .where(eq(applications.id, id))
    .returning({ id: applications.id });
  return rows.length > 0;
}

export async function listStageHistory(tx: Tx, applicationId: string) {
  return tx
    .select({
      id: stageHistory.id,
      fromStage: stageHistory.fromStage,
      toStage: stageHistory.toStage,
      changedAt: stageHistory.changedAt,
    })
    .from(stageHistory)
    .where(eq(stageHistory.applicationId, applicationId))
    .orderBy(asc(stageHistory.changedAt), asc(stageHistory.id));
}

// Etkinlikler (FR-07)

const activityColumns = {
  id: activities.id,
  applicationId: activities.applicationId,
  type: activities.type,
  occurredAt: activities.occurredAt,
  contactName: activities.contactName,
  notes: activities.notes,
  createdAt: activities.createdAt,
};

export type ActivityRow = Awaited<ReturnType<typeof listActivities>>[number];

export async function listActivities(tx: Tx, applicationId: string) {
  return tx
    .select(activityColumns)
    .from(activities)
    .where(eq(activities.applicationId, applicationId))
    .orderBy(desc(activities.occurredAt));
}

export async function getActivity(tx: Tx, id: string): Promise<ActivityRow | null> {
  const rows = await tx.select(activityColumns).from(activities).where(eq(activities.id, id));
  return rows[0] ?? null;
}

export async function insertActivity(
  tx: Tx,
  values: {
    userId: string;
    applicationId: string;
    type: ActivityRow['type'];
    occurredAt: Date;
    contactName: string | null;
    notes: string | null;
  },
): Promise<string> {
  const now = new Date();
  const rows = await tx
    .insert(activities)
    .values({ id: sql`uuidv7()`, ...values, createdAt: now, updatedAt: now })
    .returning({ id: activities.id });
  const id = rows[0]?.id;
  if (!id) throw new Error('etkinlik oluşturulamadı');
  return id;
}

export async function updateActivity(
  tx: Tx,
  id: string,
  values: Partial<
    Pick<typeof activities.$inferInsert, 'type' | 'occurredAt' | 'contactName' | 'notes'>
  >,
): Promise<boolean> {
  const rows = await tx
    .update(activities)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(activities.id, id))
    .returning({ id: activities.id });
  return rows.length > 0;
}

export async function deleteActivity(tx: Tx, id: string): Promise<boolean> {
  const rows = await tx
    .delete(activities)
    .where(eq(activities.id, id))
    .returning({ id: activities.id });
  return rows.length > 0;
}

/** Bir başvurunun "son güncellenme" zamanını ilerletir (etkinlik eklenince listede öne çıksın). */
export async function touchApplication(tx: Tx, id: string): Promise<void> {
  await tx.update(applications).set({ updatedAt: new Date() }).where(eq(applications.id, id));
}
