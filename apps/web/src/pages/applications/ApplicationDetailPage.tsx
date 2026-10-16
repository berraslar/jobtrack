import { useState, type ReactNode, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  ACTIVITY_TYPES,
  activityCreateSchema,
  APPLICATION_STAGES,
  type Activity,
  type ApplicationCreate,
  type ApplicationDetail,
  type ApplicationStage,
} from '@jobtrack/shared';
import {
  Alert,
  ArrowIcon,
  BACK_LINK,
  Button,
  Card,
  ConfirmDialog,
  Field,
  FollowUpBadge,
  FOCUS_RING,
  HUE_SOLID,
  LINK,
  Monogram,
  SelectField,
  SHEET,
  StageBadge,
  StageRuler,
  stageHue,
  stagger,
  TextAreaField,
} from '../../components/ui';
import { useI18n } from '../../i18n';
import { formText } from '../../lib/api';
import { fromLocalInput, toLocalInput } from '../../lib/format';
import {
  useAddActivity,
  useApplication,
  useChangeStage,
  useCreateCompany,
  useDeleteActivity,
  useDeleteApplication,
  useSetArchived,
  useUpdateActivity,
  useUpdateApplication,
} from '../../lib/queries';
import { ApplicationForm } from './ApplicationForm';

export function ApplicationDetailPage() {
  const { t, errorMessage } = useI18n();
  const { id = '' } = useParams();
  const application = useApplication(id);

  if (application.isPending) return <p role="status">{t.common.loading}</p>;
  if (application.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>{errorMessage(application.error)}</Alert>
        <Link to="/" className={LINK}>
          {t.applicationDetail.back}
        </Link>
      </div>
    );
  }
  return <ApplicationDetailView application={application.data} />;
}

function ApplicationDetailView({ application }: { application: ApplicationDetail }) {
  const { t, labels, formatDateTime, errorMessage } = useI18n();
  const d = t.applicationDetail;
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const changeStage = useChangeStage();
  const setArchived = useSetArchived(application.id);
  const remove = useDeleteApplication();
  const update = useUpdateApplication(application.id);
  const createCompany = useCreateCompany();

  const saveEdit = async (input: ApplicationCreate) => {
    // Formda yeni bir şirket adı yazıldıysa önce şirket oluşturulur.
    const companyId =
      'companyId' in input
        ? input.companyId
        : (await createCompany.mutateAsync({ name: input.companyName })).id;
    const { positionTitle, cvVersionId, jobUrl, source, location, workMode } = input;
    const { salaryExpectation, appliedAt, notes } = input;
    await update.mutateAsync({
      companyId,
      positionTitle,
      cvVersionId: cvVersionId ?? null,
      jobUrl: jobUrl ?? null,
      source: source ?? null,
      location: location ?? null,
      workMode: workMode ?? null,
      salaryExpectation: salaryExpectation ?? null,
      appliedAt: appliedAt ?? null,
      notes: notes ?? null,
    });
    setEditing(false);
  };

  const editError = update.error ?? createCompany.error;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/" className={BACK_LINK}>
          <ArrowIcon direction="left" />
          {d.back}
        </Link>
        <div
          className={`${SHEET} relative mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-5 overflow-hidden p-6 sm:p-8`}
        >
          {/* Mevcut aşamanın tonunda, köşede yumuşak bir ışık. */}
          <span
            aria-hidden
            className={`pointer-events-none absolute -top-24 -right-16 size-72 rounded-full opacity-35 blur-3xl transition-colors duration-700 ${HUE_SOLID[stageHue(application.currentStage)]}`}
          />
          <div className="relative flex min-w-0 items-start gap-4">
            <Monogram name={application.company.name} large className="mt-1" />
            <div className="min-w-0">
              <h1 className="text-[2rem] leading-tight font-bold tracking-[-0.035em] sm:text-[2.5rem]">
                {application.positionTitle}
              </h1>
              <p className="mt-1 text-lg text-ink-muted">
                <Link
                  to={`/sirketler/${application.company.id}`}
                  className={`rounded-xs hover:text-ink hover:underline ${FOCUS_RING}`}
                >
                  {application.company.name}
                </Link>
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <StageBadge stage={application.currentStage} />
                <StageRuler stage={application.currentStage} className="w-48" />
                {application.needsFollowUp && <FollowUpBadge />}
                {application.archivedAt && (
                  <span className="rounded-full bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
                    {t.common.archived}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="relative flex flex-wrap gap-2">
            {!editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(true);
                }}
              >
                {t.common.edit}
              </Button>
            )}
            <Button
              variant="secondary"
              disabled={setArchived.isPending}
              onClick={() => {
                setArchived.mutate(!application.archivedAt);
              }}
            >
              {application.archivedAt ? d.unarchive : d.archive}
            </Button>
            <Button
              variant="danger-quiet"
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              {t.common.delete}
            </Button>
          </div>
        </div>
      </div>

      <FollowUpHint application={application} />

      <Card title={d.stageCard}>
        <div className="max-w-xs">
          <SelectField
            label={d.currentStage}
            value={application.currentStage}
            disabled={changeStage.isPending}
            onChange={(event) => {
              changeStage.mutate({
                id: application.id,
                stage: event.target.value as ApplicationStage,
              });
            }}
          >
            {APPLICATION_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {labels.stages[stage]}
              </option>
            ))}
          </SelectField>
        </div>
        {changeStage.isError && (
          <div className="mt-3">
            <Alert>{errorMessage(changeStage.error)}</Alert>
          </div>
        )}
        <h3 className="mt-8 mb-3 text-base font-semibold">{d.history}</h3>
        <ol className="relative ml-1.5 border-l-2 border-dashed border-line-strong text-sm">
          {[...application.stageHistory].reverse().map((entry, i) => (
            <li
              key={entry.id}
              className="rise relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-2.5 pl-5 sm:grid-cols-[11rem_minmax(0,1fr)]"
              style={stagger(i)}
            >
              <span
                aria-hidden
                className={`absolute top-[0.9rem] -left-[7px] size-3 rounded-full ring-4 ring-surface ${HUE_SOLID[stageHue(entry.toStage)]}`}
              />
              <span className="order-2 text-xs whitespace-nowrap text-ink-muted sm:order-1 sm:pt-0.5">
                {formatDateTime(entry.changedAt)}
              </span>
              <span className="order-1 sm:order-2">
                <span className={i === 0 ? 'font-semibold' : 'font-medium'}>
                  {labels.stages[entry.toStage]}
                </span>
                {entry.fromStage && (
                  <span className="text-ink-muted">
                    {/* Görsel ok; ekran okuyucuya "önceki aşama" diye okunur. */}
                    <ArrowIcon direction="left" className="mx-1.5 inline size-3 align-[-0.1em]" />
                    <span className="sr-only">, {d.previousStage} </span>
                    {labels.stages[entry.fromStage]}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title={d.infoCard}>
        {editing ? (
          <ApplicationForm
            initial={application}
            submitLabel={d.saveChanges}
            pending={update.isPending || createCompany.isPending}
            serverError={editError ? errorMessage(editError) : null}
            onSubmit={(input) => {
              void saveEdit(input).catch(() => undefined);
            }}
            onCancel={() => {
              setEditing(false);
            }}
          />
        ) : (
          <ApplicationFacts application={application} />
        )}
      </Card>

      <ActivitiesCard application={application} />

      <ConfirmDialog
        open={confirmDelete}
        title={d.deleteTitle}
        description={
          <>
            <strong className="text-ink">
              {application.company.name} – {application.positionTitle}
            </strong>
            {d.deleteDescription}
          </>
        }
        confirmLabel={d.deleteConfirm}
        pending={remove.isPending}
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          remove.mutate(application.id, {
            onSuccess: () => {
              setConfirmDelete(false);
              void navigate('/');
            },
          });
        }}
      />
    </div>
  );
}

function FollowUpHint({ application }: { application: ApplicationDetail }) {
  const { t, formatDate } = useI18n();
  if (!application.needsFollowUp) return null;
  return (
    <Alert tone="warning">
      {t.applicationDetail.followUpHint(formatDate(application.lastActivityAt.slice(0, 10)))}
    </Alert>
  );
}

function ApplicationFacts({ application }: { application: ApplicationDetail }) {
  const { t, labels, formatDate } = useI18n();
  const f = t.applicationDetail.facts;
  const none = t.common.none;
  const rows: [string, ReactNode][] = [
    [f.appliedAt, formatDate(application.appliedAt)],
    [f.source, application.source ? labels.sources[application.source] : none],
    [f.cvVersion, application.cvVersion?.label ?? none],
    [f.location, application.location ?? none],
    [f.workMode, application.workMode ? labels.workModes[application.workMode] : none],
    [f.salary, application.salaryExpectation ?? none],
    [
      f.jobUrl,
      application.jobUrl ? (
        // Bağlantı sunucuda http(s) ile sınırlanır; yeni sekme, sayfaya erişim vermez.
        <a
          href={application.jobUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`break-all ${LINK}`}
        >
          {application.jobUrl}
        </a>
      ) : (
        none
      ),
    ],
  ];
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid text-sm sm:grid-cols-2 sm:gap-x-10">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 border-b border-line py-2.5"
          >
            <dt className="text-ink-muted">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {application.notes && (
        <div className="text-sm">
          <h3 className="mb-1 text-ink-muted">{f.notes}</h3>
          <p className="max-w-[65ch] whitespace-pre-wrap">{application.notes}</p>
        </div>
      )}
    </div>
  );
}

function ActivitiesCard({ application }: { application: ApplicationDetail }) {
  const { t, errorMessage } = useI18n();
  const add = useAddActivity(application.id);
  const [formKey, setFormKey] = useState(0);
  return (
    <Card title={t.activities.card}>
      <ActivityForm
        key={formKey}
        submitLabel={t.activities.add}
        pending={add.isPending}
        serverError={add.isError ? errorMessage(add.error) : null}
        onSubmit={(input) => {
          add.mutate(input, {
            onSuccess: () => {
              setFormKey((k) => k + 1);
            },
          });
        }}
      />
      {application.activities.length > 0 && (
        <ul className="mt-8 border-t border-line">
          {application.activities.map((activity) => (
            <ActivityItem key={activity.id} activity={activity} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const { t, labels, formatDateTime, errorMessage } = useI18n();
  const typeLabel = labels.activities[activity.type];
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const update = useUpdateActivity();
  const remove = useDeleteActivity();

  if (editing) {
    return (
      <li className="border-b border-line py-4">
        <ActivityForm
          initial={activity}
          submitLabel={t.common.save}
          pending={update.isPending}
          serverError={update.isError ? errorMessage(update.error) : null}
          onSubmit={(body) => {
            update.mutate(
              { id: activity.id, body },
              {
                onSuccess: () => {
                  setEditing(false);
                },
              },
            );
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-2 border-b border-line py-4 text-sm">
      <div>
        <p className="font-medium">
          {typeLabel}
          {activity.contactName && (
            <span className="text-ink-muted"> · {activity.contactName}</span>
          )}
        </p>
        <p className="text-xs text-ink-muted">{formatDateTime(activity.occurredAt)}</p>
        {activity.notes && <p className="mt-1 whitespace-pre-wrap">{activity.notes}</p>}
      </div>
      <div className="ml-auto flex gap-1">
        <Button
          variant="ghost"
          aria-label={t.activities.editLabel(typeLabel)}
          onClick={() => {
            setEditing(true);
          }}
        >
          {t.common.edit}
        </Button>
        <Button
          variant="ghost"
          aria-label={t.activities.deleteLabel(typeLabel)}
          onClick={() => {
            setConfirm(true);
          }}
        >
          {t.common.delete}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t.activities.deleteTitle}
        description={t.activities.deleteDescription}
        confirmLabel={t.common.delete}
        pending={remove.isPending}
        onCancel={() => {
          setConfirm(false);
        }}
        onConfirm={() => {
          remove.mutate(activity.id, {
            onSuccess: () => {
              setConfirm(false);
            },
          });
        }}
      />
    </li>
  );
}

function ActivityForm({
  initial,
  submitLabel,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  initial?: Activity;
  submitLabel: string;
  pending: boolean;
  serverError: string | null;
  onSubmit: (input: {
    type: Activity['type'];
    occurredAt: string;
    contactName: string | null;
    notes: string | null;
  }) => void;
  onCancel?: () => void;
}) {
  const { t, labels, issueMessage } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const when = formText(form, 'occurredAt');
    const parsed = activityCreateSchema.safeParse({
      type: formText(form, 'type'),
      occurredAt: when ? fromLocalInput(when) : '',
      contactName: formText(form, 'contactName'),
      notes: formText(form, 'notes'),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? issueMessage(issue) : t.common.invalidForm);
      return;
    }
    setError(null);
    onSubmit({
      type: parsed.data.type,
      occurredAt: parsed.data.occurredAt,
      contactName: parsed.data.contactName ?? null,
      notes: parsed.data.notes ?? null,
    });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      {(error ?? serverError) && <Alert>{error ?? serverError}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label={t.activities.type}
          name="type"
          defaultValue={initial?.type ?? 'interview'}
        >
          {ACTIVITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {labels.activities[type]}
            </option>
          ))}
        </SelectField>
        <Field
          label={t.activities.occurredAt}
          name="occurredAt"
          type="datetime-local"
          required
          defaultValue={toLocalInput(initial?.occurredAt ?? new Date().toISOString())}
        />
        <Field
          label={t.activities.contact}
          name="contactName"
          defaultValue={initial?.contactName ?? ''}
        />
      </div>
      <TextAreaField
        label={t.activities.note}
        name="notes"
        rows={2}
        defaultValue={initial?.notes ?? ''}
      />
      <div className="flex gap-2">
        <Button type="submit" variant={initial ? 'primary' : 'secondary'} disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
