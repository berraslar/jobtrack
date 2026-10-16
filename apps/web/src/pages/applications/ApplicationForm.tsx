import { useId, useState, type SubmitEvent } from 'react';
import {
  APPLICATION_SOURCES,
  type ApplicationCreate,
  applicationCreateSchema,
  type ApplicationDetail,
  type ApplicationPrefill,
  WORK_MODES,
} from '@jobtrack/shared';
import { Alert, Button, Field, SelectField, TextAreaField } from '../../components/ui';
import { useI18n } from '../../i18n';
import { formText } from '../../lib/api';
import { useCompanies, useCvVersions } from '../../lib/queries';

type FieldErrors = Partial<Record<string, string>>;

/**
 * NFR-09: tek form, zorunlu alanlar yalnızca şirket ve pozisyon. Şirket alanı, kayıtlı şirketleri
 * öneren serbest metindir; yeni bir ad yazılırsa şirket otomatik oluşturulur.
 * Doğrulama sunucuyla aynı Zod şemasıyla yapılır.
 */
export function ApplicationForm({
  initial,
  prefill,
  submitLabel,
  pending,
  serverError,
  onSubmit,
  onCancel,
}: {
  initial?: ApplicationDetail;
  /** FR-22: yer imi betiğinden gelen, doğrulanmış önceden doldurma değerleri. */
  prefill?: ApplicationPrefill;
  submitLabel: string;
  pending: boolean;
  serverError: string | null;
  onSubmit: (input: ApplicationCreate) => void;
  onCancel?: () => void;
}) {
  const { t, locale, labels, issueMessage } = useI18n();
  const f = t.applicationForm;
  const companies = useCompanies();
  const cvVersions = useCvVersions();
  const listId = useId();
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const text = (name: string) => formText(form, name);
    const companyName = text('companyName').trim();
    const existing = companies.data?.find(
      (c) => c.name.toLocaleLowerCase(locale) === companyName.toLocaleLowerCase(locale),
    );
    const optional = (name: string) => text(name) || null;

    const parsed = applicationCreateSchema.safeParse({
      ...(existing ? { companyId: existing.id } : { companyName }),
      positionTitle: text('positionTitle'),
      jobUrl: text('jobUrl'),
      source: optional('source'),
      location: text('location'),
      workMode: optional('workMode'),
      salaryExpectation: text('salaryExpectation'),
      cvVersionId: optional('cvVersionId'),
      appliedAt: optional('appliedAt'),
      notes: text('notes'),
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] === 'companyId' ? 'companyName' : issue.path[0]);
        next[key] ??= issueMessage(issue);
      }
      // Şirket adı boşsa union hatası pozisyon dışındaki tüm alanlara yayılabilir; sade mesaj göster.
      if (!companyName) next.companyName = f.companyRequired;
      setErrors(next);
      // İlk hatalı alana odaklan.
      const first = Object.keys(next)[0];
      if (first) form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setErrors({});
    onSubmit(parsed.data);
  };

  const err = (name: string) => errors[name];

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {serverError && <Alert>{serverError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={f.company}
          name="companyName"
          list={listId}
          autoComplete="off"
          required
          defaultValue={initial?.company.name ?? prefill?.companyName ?? ''}
          error={err('companyName')}
          hint={f.companyHint}
        />
        <datalist id={listId}>
          {companies.data?.map((company) => (
            <option key={company.id} value={company.name} />
          ))}
        </datalist>
        <Field
          label={f.position}
          name="positionTitle"
          required
          defaultValue={initial?.positionTitle ?? prefill?.positionTitle ?? ''}
          error={err('positionTitle')}
        />
        <Field
          label={f.jobUrl}
          name="jobUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={initial?.jobUrl ?? prefill?.jobUrl ?? ''}
          error={err('jobUrl')}
        />
        <SelectField
          label={f.source}
          name="source"
          defaultValue={initial?.source ?? prefill?.source ?? ''}
          error={err('source')}
        >
          <option value="">{t.common.notSelected}</option>
          {APPLICATION_SOURCES.map((source) => (
            <option key={source} value={source}>
              {labels.sources[source]}
            </option>
          ))}
        </SelectField>
        <Field
          label={f.appliedAt}
          name="appliedAt"
          type="date"
          defaultValue={initial?.appliedAt ?? prefill?.appliedAt ?? ''}
          error={err('appliedAt')}
          hint={f.appliedAtHint}
        />
        <SelectField
          label={f.cvVersion}
          name="cvVersionId"
          defaultValue={initial?.cvVersion?.id ?? ''}
          error={err('cvVersionId')}
        >
          <option value="">{t.common.notSelected}</option>
          {cvVersions.data?.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.label}
            </option>
          ))}
        </SelectField>
        <Field
          label={f.location}
          name="location"
          defaultValue={initial?.location ?? prefill?.location ?? ''}
          error={err('location')}
        />
        <SelectField
          label={f.workMode}
          name="workMode"
          defaultValue={initial?.workMode ?? ''}
          error={err('workMode')}
        >
          <option value="">{t.common.notSelected}</option>
          {WORK_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {labels.workModes[mode]}
            </option>
          ))}
        </SelectField>
        <Field
          label={f.salary}
          name="salaryExpectation"
          placeholder={f.salaryPlaceholder}
          defaultValue={initial?.salaryExpectation ?? ''}
          error={err('salaryExpectation')}
        />
      </div>
      <TextAreaField
        label={f.notes}
        name="notes"
        defaultValue={initial?.notes ?? ''}
        error={err('notes')}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t.common.saving : submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
