import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { companyCreateSchema } from '@jobtrack/shared';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  FOCUS_RING,
  Monogram,
  PageHeader,
  SHEET,
  stagger,
} from '../../components/ui';
import { useI18n } from '../../i18n';
import { formText } from '../../lib/api';
import { useCompanies, useCreateCompany } from '../../lib/queries';

/** FR-13: şirket kayıtları. */
export function CompaniesPage() {
  const { t, errorMessage, issueMessage } = useI18n();
  const c = t.companies;
  const companies = useCompanies();
  const create = useCreateCompany();
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = companyCreateSchema.safeParse({
      name: formText(form, 'name'),
      sector: formText(form, 'sector'),
      website: formText(form, 'website'),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? issueMessage(issue) : t.common.invalidForm);
      return;
    }
    setError(null);
    create.mutate(parsed.data, {
      onSuccess: () => {
        form.reset();
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={c.title} count={companies.data?.length} />
      <Card title={c.addCard}>
        <form noValidate onSubmit={submit} className="flex flex-col gap-3">
          {(error ?? (create.isError ? errorMessage(create.error) : null)) && (
            <Alert>{error ?? errorMessage(create.error)}</Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={c.name} name="name" required />
            <Field label={c.sector} name="sector" />
            <Field label={c.website} name="website" type="url" placeholder="https://" />
          </div>
          <div>
            <Button type="submit" disabled={create.isPending}>
              {t.common.add}
            </Button>
          </div>
        </form>
      </Card>

      {companies.isError && <Alert>{errorMessage(companies.error)}</Alert>}
      {companies.data?.length === 0 && <EmptyState>{c.empty}</EmptyState>}
      {companies.data && companies.data.length > 0 && (
        <ul className={`${SHEET} divide-y divide-line overflow-hidden p-2`}>
          {companies.data.map((company, i) => (
            <li key={company.id} className="rise" style={stagger(i)}>
              <Link
                to={`/sirketler/${company.id}`}
                className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 rounded-lg px-3 py-3 transition-colors duration-200 hover:bg-surface-muted sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,1fr)_auto] ${FOCUS_RING}`}
              >
                <Monogram
                  name={company.name}
                  className="row-span-2 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-rotate-6 group-hover:scale-105 sm:row-span-1"
                />
                <span className="truncate font-semibold">{company.name}</span>
                <span className="col-start-2 row-start-2 truncate text-sm text-ink-muted sm:col-start-3 sm:row-start-1">
                  {company.sector ?? c.noSector}
                </span>
                <span className="col-start-3 row-span-2 row-start-1 rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-ink-muted sm:col-start-4 sm:row-span-1">
                  {t.common.applicationCount(company.applicationCount)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
