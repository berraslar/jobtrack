import { useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  APPLICATION_SOURCES,
  APPLICATION_STAGES,
  type Application,
  type ApplicationListQuery,
  type ApplicationSource,
  type ApplicationStage,
} from '@jobtrack/shared';
import {
  Alert,
  EmptyState,
  Field,
  FollowUpBadge,
  FOCUS_RING,
  LINK,
  PageHeader,
  PRIMARY_LINK,
  SelectField,
  SHEET,
  stagger,
  StageBadge,
  StageRuler,
} from '../../components/ui';
import { useI18n } from '../../i18n';
import { useLoginNotice, useMe } from '../../lib/auth';
import { useApplications, useCvVersions, useStats } from '../../lib/queries';
import { KanbanBoard } from './KanbanBoard';

type View = 'liste' | 'kanban';

const ARCHIVED_OPTIONS = ['exclude', 'include', 'only'] as const;

const isOneOf = <T extends string>(values: readonly T[], value: string | null): value is T =>
  value !== null && (values as readonly string[]).includes(value);

/** Filtreler URL'de tutulur: sayfa yenilenince veya bağlantı paylaşılınca korunur. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const get = (key: string) => params.get(key) ?? '';
  const view: View = params.get('gorunum') === 'kanban' ? 'kanban' : 'liste';
  const stage = params.get('stage');
  const source = params.get('source');
  const archived = params.get('archived');

  const query: Partial<ApplicationListQuery> = {
    ...(get('q') ? { q: get('q') } : {}),
    ...(isOneOf<ApplicationStage>(APPLICATION_STAGES, stage) && view === 'liste' ? { stage } : {}),
    ...(isOneOf<ApplicationSource>(APPLICATION_SOURCES, source) ? { source } : {}),
    ...(get('cvVersionId') ? { cvVersionId: get('cvVersionId') } : {}),
    ...(get('appliedFrom') ? { appliedFrom: get('appliedFrom') } : {}),
    ...(get('appliedTo') ? { appliedTo: get('appliedTo') } : {}),
    ...(get('followUp') === 'true' ? { followUp: true } : {}),
    ...(isOneOf(ARCHIVED_OPTIONS, archived) ? { archived } : {}),
  };

  const set = (key: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  return {
    query,
    view,
    get,
    set,
    hasFilters: params.toString().replace(/gorunum=\w+&?/, '') !== '',
  };
}

export function ApplicationsPage() {
  const { t, labels, errorMessage } = useI18n();
  const a = t.applications;
  const { data: me } = useMe();
  const failedAttempts = useLoginNotice();
  const { query, view, get, set, hasFilters } = useFilters();
  const applications = useApplications(query);
  const cvVersions = useCvVersions();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title={a.title}
        count={applications.data?.length}
        actions={
          <Link to="/basvurular/yeni" className={PRIMARY_LINK}>
            <PlusIcon />
            {a.new}
          </Link>
        }
      />

      {failedAttempts > 0 && (
        // ADR-0003: e-posta yerine uygulama içi uyarı.
        <Alert tone="warning">
          {a.failedAttempts.before(failedAttempts)}
          <Link to="/ayarlar" className={`font-medium ${LINK}`}>
            {a.failedAttempts.link}
          </Link>
          {a.failedAttempts.after}
        </Alert>
      )}
      {me && !me.mfaEnabled && (
        <Alert tone="warning">
          {a.mfaOff.before}
          <Link to="/ayarlar" className={`font-medium ${LINK}`}>
            {a.mfaOff.link}
          </Link>
          {a.mfaOff.after}
        </Alert>
      )}

      <TodayBand />

      <div role="search" aria-label={a.search.region} className={`${SHEET} p-5 sm:p-6`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label={a.search.query}
            type="search"
            placeholder={a.search.queryPlaceholder}
            value={get('q')}
            onChange={(e) => {
              set('q', e.target.value);
            }}
          />
          {/* Dar ekranda diğer filtreler bir düğmenin arkasında; geniş ekranda hep açık. */}
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            onClick={() => {
              setFiltersOpen((open) => !open);
            }}
            className={`flex min-h-10 items-center justify-between rounded-full bg-surface-muted px-4 text-sm font-semibold text-ink sm:hidden ${FOCUS_RING}`}
          >
            {filtersOpen ? a.search.hideFilters : a.search.showFilters}
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className={`size-3.5 transition-transform duration-300 ${filtersOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
          <div id={filtersId} className={filtersOpen ? 'contents' : 'hidden sm:contents'}>
            {view === 'liste' && (
              <SelectField
                label={a.search.stage}
                value={get('stage')}
                onChange={(e) => {
                  set('stage', e.target.value);
                }}
              >
                <option value="">{t.common.all}</option>
                {APPLICATION_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {labels.stages[stage]}
                  </option>
                ))}
              </SelectField>
            )}
            <SelectField
              label={a.search.source}
              value={get('source')}
              onChange={(e) => {
                set('source', e.target.value);
              }}
            >
              <option value="">{t.common.all}</option>
              {APPLICATION_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {labels.sources[source]}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={a.search.cvVersion}
              value={get('cvVersionId')}
              onChange={(e) => {
                set('cvVersionId', e.target.value);
              }}
            >
              <option value="">{t.common.all}</option>
              {cvVersions.data?.map((cv) => (
                <option key={cv.id} value={cv.id}>
                  {cv.label}
                </option>
              ))}
            </SelectField>
            <Field
              label={a.search.appliedFrom}
              type="date"
              value={get('appliedFrom')}
              onChange={(e) => {
                set('appliedFrom', e.target.value);
              }}
            />
            <Field
              label={a.search.appliedTo}
              type="date"
              value={get('appliedTo')}
              onChange={(e) => {
                set('appliedTo', e.target.value);
              }}
            />
            <SelectField
              label={a.search.archive}
              value={get('archived') || 'exclude'}
              onChange={(e) => {
                set('archived', e.target.value === 'exclude' ? '' : e.target.value);
              }}
            >
              {ARCHIVED_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {a.search.archiveOptions[option]}
                </option>
              ))}
            </SelectField>
            <label className="flex min-h-10 items-center gap-2 self-end text-sm">
              <input
                type="checkbox"
                className="size-4 accent-lilac-solid"
                checked={get('followUp') === 'true'}
                onChange={(e) => {
                  set('followUp', e.target.checked ? 'true' : '');
                }}
              />
              {a.search.followUpOnly}
            </label>
          </div>
        </div>
      </div>

      <div
        role="group"
        aria-label={a.view.label}
        className="flex self-start rounded-full bg-surface p-1 shadow-soft ring-1 ring-line"
      >
        {(['liste', 'kanban'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => {
              set('gorunum', option === 'liste' ? '' : option);
            }}
            className={`min-h-9 rounded-full px-5 text-sm font-semibold transition-[background-color,color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${FOCUS_RING} ${
              view === option ? 'bg-lilac text-ink shadow-soft' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {option === 'liste' ? a.view.list : a.view.kanban}
          </button>
        ))}
      </div>

      {applications.isError && <Alert>{errorMessage(applications.error)}</Alert>}
      {applications.isPending && <p role="status">{t.common.loading}</p>}
      {applications.data &&
        (applications.data.length === 0 ? (
          <EmptyState>
            {hasFilters ? (
              a.noMatches
            ) : (
              <>
                {a.empty.before}
                <Link to="/basvurular/yeni" className={`font-medium ${LINK}`}>
                  {a.empty.link}
                </Link>
                {a.empty.after}
              </>
            )}
          </EmptyState>
        ) : view === 'kanban' ? (
          <KanbanBoard applications={applications.data} />
        ) : (
          <ApplicationTable applications={applications.data} />
        ))}
    </div>
  );
}

function ApplicationTable({ applications }: { applications: Application[] }) {
  const { t, formatDate } = useI18n();
  const c = t.applications.table;
  // Hücre metni sütun çizgisinden başlar (sol boşluk yok), filtre alanlarıyla aynı hizada.
  const th = 'px-3 py-3 text-xs font-semibold text-ink-muted first:pl-5 last:pr-5';
  const td = 'px-3 py-4 align-top first:pl-5 last:pr-5';
  return (
    <div className={`${SHEET} min-w-0 overflow-x-auto`}>
      <table className="w-full border-collapse text-left text-sm md:min-w-[44rem] lg:table-fixed">
        <caption className="sr-only">{c.caption(applications.length)}</caption>
        <colgroup>
          <col className="lg:w-[28%]" />
          <col className="hidden md:table-column lg:w-[22%]" />
          <col className="lg:w-[22%]" />
          {/* Tarih sığsın: başlık ve tarih aynı sağ kenarda biter. */}
          <col className="hidden sm:table-column lg:w-[12%]" />
          <col className="hidden lg:table-column lg:w-[16%]" />
        </colgroup>
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={th}>
              {c.position}
            </th>
            <th scope="col" className={`${th} hidden md:table-cell`}>
              {c.company}
            </th>
            <th scope="col" className={th}>
              {c.stage}
            </th>
            <th scope="col" className={`${th} hidden text-right sm:table-cell`}>
              {c.applied}
            </th>
            <th scope="col" className={`${th} hidden lg:table-cell`}>
              {c.cv}
            </th>
          </tr>
        </thead>
        <tbody>
          {applications.map((application, i) => (
            <tr
              key={application.id}
              className="rise border-b border-line transition-colors duration-200 last:border-b-0 hover:bg-surface-muted"
              style={stagger(i)}
            >
              <td className={td}>
                <Link
                  to={`/basvurular/${application.id}`}
                  className={`rounded-xs font-display text-[1rem] font-semibold text-ink hover:underline ${FOCUS_RING}`}
                >
                  {application.positionTitle}
                </Link>
                {application.archivedAt && (
                  <span className="ml-2 text-xs text-ink-muted">{c.archivedSuffix}</span>
                )}
                {/* Dar ekranda şirket sütunu gizlenir; şirket pozisyonun altında görünür. */}
                <span className="mt-0.5 block text-ink-muted md:hidden">
                  {application.company.name}
                </span>
                {application.needsFollowUp && (
                  <div className="mt-1">
                    <FollowUpBadge />
                  </div>
                )}
              </td>
              <td className={`${td} hidden md:table-cell`}>
                <Link
                  to={`/sirketler/${application.company.id}`}
                  className={`rounded-xs text-ink-muted hover:text-ink hover:underline ${FOCUS_RING}`}
                >
                  {application.company.name}
                </Link>
              </td>
              <td className={td}>
                <div className="flex flex-col gap-2">
                  <StageBadge stage={application.currentStage} />
                  <StageRuler stage={application.currentStage} />
                </div>
              </td>
              <td
                className={`${td} hidden text-right whitespace-nowrap text-ink-muted sm:table-cell`}
              >
                {formatDate(application.appliedAt)}
              </td>
              <td className={`${td} hidden text-ink-muted lg:table-cell`}>
                {application.cvVersion?.label ?? t.common.none}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <path d="M8 2.5v11M2.5 8h11" />
    </svg>
  );
}

/** "Bugün ne var": takip edilecekler ve sıradaki mülakat (PRODUCT ilke 1). */
function TodayBand() {
  const { t, formatDateTime } = useI18n();
  const stats = useStats();
  const a = t.applications.today;
  if (!stats.data) return null;
  const { followUpCount, nextInterview } = stats.data;
  const label = 'text-xs font-semibold text-ink-muted';
  return (
    <section aria-label={a.region} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div
        className={`rise flex flex-col gap-1 rounded-xl px-5 py-4 ${followUpCount > 0 ? 'bg-rose' : 'bg-butter'}`}
      >
        <span className={label}>{a.followUps}</span>
        {followUpCount > 0 ? (
          <Link
            to="/?followUp=true"
            className={`w-fit font-display text-lg font-bold text-signal underline decoration-signal/40 underline-offset-4 hover:decoration-signal ${FOCUS_RING}`}
          >
            {a.followUpsValue(followUpCount)}
          </Link>
        ) : (
          <span className="font-display text-lg font-bold text-ink-muted">
            {a.followUpsValue(0)}
          </span>
        )}
      </div>
      <div
        className="rise relative flex min-w-0 flex-col gap-1 overflow-hidden rounded-xl bg-sky px-5 py-4 lg:col-span-3"
        style={stagger(1)}
      >
        <span className={label}>{a.nextInterview}</span>
        {nextInterview ? (
          <span className="min-w-0 truncate">
            <span className="font-display text-lg font-bold">
              {formatDateTime(nextInterview.occurredAt)}
            </span>
            <span className="text-ink-muted"> · </span>
            <Link
              to={`/basvurular/${nextInterview.applicationId}`}
              className={`rounded-xs hover:underline ${FOCUS_RING}`}
            >
              {nextInterview.companyName} – {nextInterview.positionTitle}
            </Link>
          </span>
        ) : (
          <span className="text-ink-muted">{a.noInterview}</span>
        )}
      </div>
    </section>
  );
}
