import { Link } from 'react-router';
import { rate, type Funnel, type Stats } from '@jobtrack/shared';
import { Alert, Card, EmptyState, FOCUS_RING, LINK, PageHeader } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useStats } from '../../lib/queries';
import { BarList, ColumnChart, DataTable, RateCell, StatTile } from './charts';

/** FR-12: aşama sayıları, dönüş ve mülakata dönüş oranları, CV versiyonuna ve kaynağa göre başarı. */
export function DashboardPage() {
  const { t, errorMessage } = useI18n();
  const stats = useStats();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t.dashboard.title} />
      {stats.isPending && <p role="status">{t.common.loading}</p>}
      {stats.isError && <Alert>{errorMessage(stats.error)}</Alert>}
      {stats.data &&
        (stats.data.overall.applied === 0 && stats.data.byStage.every((s) => s.count === 0) ? (
          <EmptyState>
            {t.dashboard.empty.before}
            <Link to="/basvurular/yeni" className={`font-medium ${LINK}`}>
              {t.dashboard.empty.link}
            </Link>
            {t.dashboard.empty.after}
          </EmptyState>
        ) : (
          <DashboardView stats={stats.data} />
        ))}
    </div>
  );
}

function DashboardView({ stats }: { stats: Stats }) {
  const { t, labels, formatDate, formatShortDate, formatPercent } = useI18n();
  const d = t.dashboard;
  const { overall } = stats;
  const stageItems = stats.byStage.map((s) => ({
    key: s.stage,
    label: labels.stages[s.stage],
    value: s.count,
  }));
  const weekItems = stats.weekly.map((w) => ({
    key: w.weekStart,
    label: d.weekOf(formatDate(w.weekStart)),
    shortLabel: formatShortDate(w.weekStart),
    value: w.count,
  }));

  return (
    <>
      <section aria-label={d.summary} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label={d.applied}
          value={String(overall.applied)}
          detail={d.appliedDetail}
          hue="lilac"
        />
        <StatTile
          label={d.responseRate}
          value={formatPercent(rate(overall.responded, overall.applied))}
          detail={d.responseDetail(overall.responded)}
          hue="sky"
          index={1}
        />
        <StatTile
          label={d.interviewRate}
          value={formatPercent(rate(overall.interviewed, overall.applied))}
          detail={d.interviewDetail(overall.interviewed)}
          hue="peach"
          index={2}
        />
        <StatTile
          label={d.offerRate}
          value={formatPercent(rate(overall.offered, overall.applied))}
          detail={d.offerDetail(overall.offered)}
          hue="mint"
          index={3}
        />
        <Link
          to="/?followUp=true"
          // Vurgu yalnızca ilgilenilecek başvuru varken.
          className={`group col-span-2 rounded-xl transition-shadow duration-300 hover:shadow-lift lg:col-span-1 ${stats.followUpCount > 0 ? '[&_p:nth-child(2)]:text-signal' : ''} ${FOCUS_RING}`}
          aria-label={d.followUpLink(stats.followUpCount)}
        >
          <StatTile
            label={d.followUp}
            value={String(stats.followUpCount)}
            detail={d.followUpDetail}
            arrow
            hue={stats.followUpCount > 0 ? 'rose' : 'butter'}
            index={4}
          />
        </Link>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={d.byStage}>
          <p className="mb-3 text-xs text-ink-muted">{d.byStageNote}</p>
          <BarList items={stageItems} unit={d.unit} />
          <DataTable
            summary={d.showTable}
            columns={[d.stageColumn, d.countColumn]}
            rows={stageItems.map((i) => [i.label, i.value])}
          />
        </Card>
        <Card title={d.weekly}>
          <p className="mb-3 text-xs text-ink-muted">{d.weeklyNote}</p>
          <ColumnChart items={weekItems} unit={d.unit} caption={d.weeklyCaption} />
          <DataTable
            summary={d.showTable}
            columns={[d.weekColumn, d.countColumn]}
            rows={weekItems.map((i) => [i.label, i.value])}
          />
        </Card>
      </div>

      <FunnelTable
        title={d.byCv}
        nameHeader={d.cvColumn}
        rows={stats.byCvVersion.map((row) => ({
          key: row.cvVersionId ?? 'none',
          name: row.label ?? t.common.unspecified,
          funnel: row,
        }))}
      />
      <FunnelTable
        title={d.bySource}
        nameHeader={d.sourceColumn}
        rows={stats.bySource.map((row) => ({
          key: row.source ?? 'none',
          name: row.source ? labels.sources[row.source] : t.common.unspecified,
          funnel: row,
        }))}
      />
    </>
  );
}

function FunnelTable({
  title,
  nameHeader,
  rows,
}: {
  title: string;
  nameHeader: string;
  rows: { key: string; name: string; funnel: Funnel }[];
}) {
  const { t } = useI18n();
  const d = t.dashboard;
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">{d.noSent}</p>
      ) : (
        <div className="overflow-x-auto">
          {/* İki huni tablosu aynı sütun genişliklerini paylaşır; dar ekranda oran çubukları gizlenir. */}
          <table className="w-full table-fixed text-left text-xs sm:text-sm">
            <colgroup>
              <col className="w-[30%] sm:w-1/4" />
              <col className="w-[16%] sm:w-[12%]" />
              <col />
              <col />
              <col />
            </colgroup>
            <thead className="border-b border-line-strong text-xs text-ink-muted">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {nameHeader}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {d.countColumn}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {d.responseColumn}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {d.interviewColumn}
                </th>
                <th scope="col" className="py-2 pr-4 font-medium">
                  {d.offerColumn}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ key, name, funnel }) => (
                <tr key={key} className="border-b border-line">
                  <th scope="row" className="truncate py-2.5 pr-4 font-medium">
                    {name}
                  </th>
                  <td className="py-2 pr-4 tabular-nums">{funnel.applied}</td>
                  <td className="py-2 pr-4">
                    <RateCell value={rate(funnel.responded, funnel.applied)} />
                  </td>
                  <td className="py-2 pr-4">
                    <RateCell value={rate(funnel.interviewed, funnel.applied)} />
                  </td>
                  <td className="py-2 pr-4">
                    <RateCell value={rate(funnel.offered, funnel.applied)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">{d.rateNote}</p>
    </Card>
  );
}
