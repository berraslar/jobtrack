import { useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { APPLICATION_STAGES, type Application, type ApplicationStage } from '@jobtrack/shared';
import {
  Alert,
  FollowUpBadge,
  FOCUS_RING,
  HUE_FILL,
  HUE_SOLID,
  stageHue,
} from '../../components/ui';
import { useI18n } from '../../i18n';
import { useChangeStage } from '../../lib/queries';

const DRAG_TYPE = 'application/x-jobtrack-application';

/**
 * FR-09 Kanban. Kart fareyle sürüklenebilir; her kartta aynı işi yapan bir aşama menüsü de vardır.
 * Böylece klavye, ekran okuyucu ve tek dokunuşla da taşınır (WCAG 2.1.1, 2.5.7).
 */
export function KanbanBoard({ applications }: { applications: Application[] }) {
  const { t, labels, errorMessage } = useI18n();
  const changeStage = useChangeStage();
  const [dropTarget, setDropTarget] = useState<ApplicationStage | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const move = (application: Application, stage: ApplicationStage) => {
    if (application.currentStage === stage) return;
    changeStage.mutate(
      { id: application.id, stage },
      {
        onSuccess: () => {
          setAnnouncement(
            t.applications.kanban.moved(
              `${application.company.name} – ${application.positionTitle}`,
              labels.stages[stage],
            ),
          );
        },
      },
    );
  };

  const onDrop = (event: DragEvent<HTMLElement>, stage: ApplicationStage) => {
    event.preventDefault();
    setDropTarget(null);
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const application = applications.find((a) => a.id === id);
    if (application) move(application, stage);
  };

  return (
    <div className="min-w-0">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {changeStage.isError && (
        <div className="mb-4">
          <Alert>{t.applications.kanban.moveFailed(errorMessage(changeStage.error))}</Alert>
        </div>
      )}
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max gap-3">
          {APPLICATION_STAGES.map((stage) => {
            const cards = applications.filter((a) => a.currentStage === stage);
            const headingId = `kanban-${stage}`;
            const hue = stageHue(stage);
            const over = dropTarget === stage;
            return (
              <section
                key={stage}
                aria-labelledby={headingId}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes(DRAG_TYPE)) {
                    event.preventDefault();
                    setDropTarget(stage);
                  }
                }}
                onDragLeave={() => {
                  setDropTarget((current) => (current === stage ? null : current));
                }}
                onDrop={(event) => {
                  onDrop(event, stage);
                }}
                className={`flex w-64 shrink-0 flex-col rounded-xl p-2 transition-[background-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  over
                    ? `${HUE_FILL[hue]} scale-[1.015] shadow-lift ring-2 ring-focus/60`
                    : 'bg-surface/55 ring-1 ring-line'
                }`}
              >
                <h2
                  id={headingId}
                  className={`mb-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2 font-sans text-sm font-bold ${HUE_FILL[hue]}`}
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden className={`size-2.5 rounded-full ${HUE_SOLID[hue]}`} />
                    {labels.stages[stage]}
                  </span>
                  <span className="min-w-6 rounded-full bg-surface/80 px-1.5 text-center text-xs font-bold text-ink">
                    {cards.length}
                  </span>
                </h2>
                <ul className="flex min-h-28 flex-col gap-2">
                  {cards.map((application) => (
                    <KanbanCard key={application.id} application={application} onMove={move} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KanbanCard({
  application,
  onMove,
}: {
  application: Application;
  onMove: (application: Application, stage: ApplicationStage) => void;
}) {
  const { t, labels, formatDate } = useI18n();
  const selectId = `stage-${application.id}`;
  const [dragging, setDragging] = useState(false);
  return (
    <li
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, application.id);
        event.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => {
        setDragging(false);
      }}
      className={`land group cursor-grab rounded-lg bg-surface p-3.5 shadow-soft ring-1 ring-line transition-[transform,box-shadow,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:shadow-lift active:cursor-grabbing ${
        dragging ? 'scale-95 opacity-60' : ''
      }`}
    >
      <Link
        to={`/basvurular/${application.id}`}
        className={`block rounded-xs font-display font-semibold text-ink hover:underline ${FOCUS_RING}`}
      >
        {application.positionTitle}
      </Link>
      <p className="text-sm text-ink-muted">{application.company.name}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        {application.appliedAt && <span>{formatDate(application.appliedAt)}</span>}
        {application.needsFollowUp && <FollowUpBadge />}
      </div>
      <label htmlFor={selectId} className="sr-only">
        {t.applications.kanban.stageOf(application.positionTitle)}
      </label>
      <select
        id={selectId}
        value={application.currentStage}
        onChange={(event) => {
          onMove(application, event.target.value as ApplicationStage);
        }}
        className={`mt-3 min-h-8 w-full rounded-full border border-control/70 bg-surface-muted px-3 text-xs font-medium text-ink ${FOCUS_RING}`}
      >
        {APPLICATION_STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {labels.stages[stage]}
          </option>
        ))}
      </select>
    </li>
  );
}
