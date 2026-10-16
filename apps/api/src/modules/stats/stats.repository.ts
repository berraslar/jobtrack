import type { ApplicationSource, ApplicationStage, Funnel } from '@jobtrack/shared';
import { and, asc, eq, gte, isNull, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../../db/client.js';
import { activities, applications, companies } from '../../db/schema.js';
import { needsFollowUp } from '../applications/applications.repository.js';

// FR-12. Huni tanımları aşama geçmişine dayanır: bir başvuru bugün "Red" olsa bile daha önce
// mülakata girdiyse "mülakata dönüştü" sayılır. Tüm sorgular RLS altında, yalnızca kullanıcının
// kendi satırları üzerinde çalışır.

const RESPONDED: ApplicationStage[] = [
  'screening',
  'technical',
  'assignment',
  'final',
  'offer',
  'accepted',
  'rejected',
];
const INTERVIEWED: ApplicationStage[] = [
  'screening',
  'technical',
  'assignment',
  'final',
  'offer',
  'accepted',
];
const OFFERED: ApplicationStage[] = ['offer', 'accepted'];

const inList = (values: readonly string[]): SQL =>
  sql`(${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )})`;

/** "Kaydedildi" dışındaki her başvuru için geçmişten türetilen huni bayrakları. */
const funnelCte = sql`
  with funnel as (
    select
      a.id,
      a.cv_version_id,
      a.source,
      bool_or(h.to_stage in ${inList(RESPONDED)}) as responded,
      bool_or(h.to_stage in ${inList(INTERVIEWED)}) as interviewed,
      bool_or(h.to_stage in ${inList(OFFERED)}) as offered
    from applications a
    join stage_history h on h.application_id = a.id
    where a.current_stage <> 'saved'
    group by a.id
  )`;

const funnelColumns = sql`
  count(*)::int as applied,
  (count(*) filter (where f.responded))::int as responded,
  (count(*) filter (where f.interviewed))::int as interviewed,
  (count(*) filter (where f.offered))::int as offered`;

export async function overallFunnel(tx: Tx): Promise<Funnel> {
  const rows = await tx.execute<Funnel>(sql`${funnelCte} select ${funnelColumns} from funnel f`);
  return rows[0] ?? { applied: 0, responded: 0, interviewed: 0, offered: 0 };
}

export async function funnelByCvVersion(tx: Tx) {
  return tx.execute<Funnel & { cvVersionId: string | null; label: string | null }>(sql`
    ${funnelCte}
    select f.cv_version_id as "cvVersionId", cv.label as label, ${funnelColumns}
    from funnel f
    left join cv_versions cv on cv.id = f.cv_version_id
    group by f.cv_version_id, cv.label
    order by applied desc, label`);
}

export async function funnelBySource(tx: Tx) {
  return tx.execute<Funnel & { source: ApplicationSource | null }>(sql`
    ${funnelCte}
    select f.source as source, ${funnelColumns}
    from funnel f
    group by f.source
    order by applied desc`);
}

export async function countByStage(tx: Tx) {
  return tx.execute<{ stage: ApplicationStage; count: number }>(sql`
    select current_stage as stage, count(*)::int as count
    from applications
    where archived_at is null
    group by current_stage`);
}

/** Son 12 hafta; başvuru olmayan haftalar 0 olarak gelir. */
export async function weeklyApplications(tx: Tx, today: string) {
  return tx.execute<{ weekStart: string; count: number }>(sql`
    select to_char(w, 'YYYY-MM-DD') as "weekStart", count(a.id)::int as count
    from generate_series(
      date_trunc('week', ${today}::date) - interval '11 weeks',
      date_trunc('week', ${today}::date),
      interval '1 week'
    ) as w
    left join applications a
      on a.applied_at >= w::date and a.applied_at < (w + interval '1 week')::date
    group by w
    order by w`);
}

export async function countFollowUps(tx: Tx, now: Date): Promise<number> {
  const rows = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from applications where ${needsFollowUp(now)}`,
  );
  return rows[0]?.count ?? 0;
}

/** Arşivde olmayan başvurulardaki ilk yaklaşan mülakat. */
export async function nextInterview(tx: Tx, now: Date) {
  const rows = await tx
    .select({
      applicationId: applications.id,
      companyName: companies.name,
      positionTitle: applications.positionTitle,
      occurredAt: activities.occurredAt,
    })
    .from(activities)
    .innerJoin(applications, eq(applications.id, activities.applicationId))
    .innerJoin(companies, eq(companies.id, applications.companyId))
    .where(
      and(
        eq(activities.type, 'interview'),
        gte(activities.occurredAt, now),
        isNull(applications.archivedAt),
      ),
    )
    .orderBy(asc(activities.occurredAt))
    .limit(1);
  const row = rows[0];
  return row ? { ...row, occurredAt: row.occurredAt.toISOString() } : null;
}
