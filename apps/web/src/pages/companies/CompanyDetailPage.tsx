import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { companyUpdateSchema, type CompanyDetail } from '@jobtrack/shared';
import {
  Alert,
  ArrowIcon,
  BACK_LINK,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  FollowUpBadge,
  FOCUS_RING,
  LINK,
  Monogram,
  SHEET,
  StageBadge,
  TextAreaField,
} from '../../components/ui';
import { useI18n } from '../../i18n';
import { formText } from '../../lib/api';
import { useCompany, useDeleteCompany, useUpdateCompany } from '../../lib/queries';

/** FR-13: bir şirketin bilgileri ve tüm başvuruları tek sayfada. */
export function CompanyDetailPage() {
  const { t, errorMessage } = useI18n();
  const { id = '' } = useParams();
  const company = useCompany(id);
  if (company.isPending) return <p role="status">{t.common.loading}</p>;
  if (company.isError) return <Alert>{errorMessage(company.error)}</Alert>;
  return <CompanyView company={company.data} />;
}

function CompanyView({ company }: { company: CompanyDetail }) {
  const { t, formatDate, errorMessage, issueMessage } = useI18n();
  const c = t.companies;
  const navigate = useNavigate();
  const update = useUpdateCompany(company.id);
  const remove = useDeleteCompany();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = companyUpdateSchema.safeParse({
      name: formText(form, 'name'),
      sector: formText(form, 'sector'),
      website: formText(form, 'website'),
      notes: formText(form, 'notes'),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? issueMessage(issue) : t.common.invalidForm);
      return;
    }
    setError(null);
    update.mutate(parsed.data, {
      onSuccess: () => {
        setEditing(false);
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link to="/sirketler" className={BACK_LINK}>
          <ArrowIcon direction="left" />
          {c.back}
        </Link>
        <div
          className={`${SHEET} mt-4 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8`}
        >
          <div className="flex min-w-0 items-center gap-4">
            <Monogram name={company.name} large />
            <h1 className="text-[2rem] leading-tight font-bold tracking-[-0.035em] sm:text-[2.5rem]">
              {company.name}
            </h1>
          </div>
          <div className="flex gap-2">
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
              variant="danger-quiet"
              onClick={() => {
                setConfirm(true);
              }}
            >
              {t.common.delete}
            </Button>
          </div>
        </div>
      </div>

      {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}

      <Card title={c.infoCard}>
        {editing ? (
          <form noValidate onSubmit={submit} className="flex flex-col gap-3">
            {(error ?? (update.isError ? errorMessage(update.error) : null)) && (
              <Alert>{error ?? errorMessage(update.error)}</Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={c.name} name="name" required defaultValue={company.name} />
              <Field label={c.sector} name="sector" defaultValue={company.sector ?? ''} />
              <Field
                label={c.website}
                name="website"
                type="url"
                defaultValue={company.website ?? ''}
              />
            </div>
            <TextAreaField label={c.notes} name="notes" defaultValue={company.notes ?? ''} />
            <div className="flex gap-2">
              <Button type="submit" disabled={update.isPending}>
                {t.common.save}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                }}
              >
                {t.common.cancel}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">{c.sector}</dt>
              <dd className="font-medium">{company.sector ?? t.common.none}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{c.website}</dt>
              <dd className="font-medium">
                {company.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`break-all ${LINK}`}
                  >
                    {company.website}
                  </a>
                ) : (
                  t.common.none
                )}
              </dd>
            </div>
            {company.notes && (
              <div className="sm:col-span-2">
                <dt className="text-ink-muted">{c.notes}</dt>
                <dd className="whitespace-pre-wrap">{company.notes}</dd>
              </div>
            )}
          </dl>
        )}
      </Card>

      <Card title={c.applicationsCard(company.applications.length)}>
        {company.applications.length === 0 ? (
          <EmptyState>{c.noApplications}</EmptyState>
        ) : (
          <ul className="border-t border-line">
            {company.applications.map((application) => (
              <li
                key={application.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3"
              >
                <div>
                  <Link
                    to={`/basvurular/${application.id}`}
                    className={`rounded-xs font-semibold hover:underline ${FOCUS_RING}`}
                  >
                    {application.positionTitle}
                  </Link>
                  <span className="block text-xs text-ink-muted">
                    {formatDate(application.appliedAt)}
                    {application.archivedAt ? c.archivedSuffix : ''}
                  </span>
                </div>
                <div className="flex gap-1">
                  <StageBadge stage={application.currentStage} />
                  {application.needsFollowUp && <FollowUpBadge />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={confirm}
        title={c.deleteTitle}
        description={
          company.applications.length > 0 ? c.deleteBlocked : c.deleteDescription(company.name)
        }
        confirmLabel={t.common.delete}
        pending={remove.isPending}
        onCancel={() => {
          setConfirm(false);
        }}
        onConfirm={() => {
          remove.mutate(company.id, {
            onSuccess: () => {
              void navigate('/sirketler');
            },
            onSettled: () => {
              setConfirm(false);
            },
          });
        }}
      />
    </div>
  );
}
