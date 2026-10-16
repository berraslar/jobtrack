import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  hasPrefill,
  JOB_DESCRIPTION_MAX,
  parsePrefill,
  type PrefillResult,
} from '@jobtrack/shared';
import { Alert, Card, PageHeader, PRIMARY_LINK, TextAreaField } from '../../components/ui';
import { useI18n } from '../../i18n';
import { useCreateApplication, useSaveJobDescriptionFor } from '../../lib/queries';
import { ApplicationForm } from './ApplicationForm';

export function NewApplicationPage() {
  const { t, errorMessage } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const create = useCreateApplication();
  const saveJob = useSaveJobDescriptionFor();
  // FR-22: yer imi betiğinin açtığı adresteki parametreler doğrulanıp forma önceden doldurulur.
  // İlan metni adres parçasındadır (#ilan=); bir kez okunur, sonra adresten ve geçmişten silinir.
  const [params] = useSearchParams();
  const [hash] = useState(() => location.hash);
  const prefill = useMemo(
    () => (hasPrefill(params, hash) ? parsePrefill(params, hash) : null),
    [params, hash],
  );
  const { pathname, search, hash: currentHash } = location;
  useEffect(() => {
    if (currentHash) void navigate({ pathname, search }, { replace: true });
  }, [currentHash, navigate, pathname, search]);
  const [jobDescription, setJobDescription] = useState(prefill?.values.jobDescription ?? '');
  const [createdId, setCreatedId] = useState<string | null>(null);

  const f = t.applicationForm;
  const n = t.newApplication;
  const fieldLabel: Record<PrefillResult['rejected'][number], string> = {
    title: f.position,
    company: f.company,
    location: f.location,
    url: f.jobUrl,
    source: f.source,
    appliedAt: f.appliedAt,
    description: n.descriptionField,
  };

  // Başvuru kaydedildi ama ilan metni kaydedilemedi: form yeniden gönderilip çift kayıt oluşmasın.
  if (createdId) {
    return (
      <div className="flex max-w-3xl flex-col gap-5">
        <PageHeader title={n.title} />
        <Alert tone="warning">
          <p>{n.jobSaveFailed}</p>
          <Link to={`/basvurular/${createdId}`} className={`mt-2 inline-block ${PRIMARY_LINK}`}>
            {n.openApplication}
          </Link>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader title={n.title} />
      {prefill && <Alert tone="success">{n.prefilled}</Alert>}
      {prefill && !params.has('yerimi') && <Alert tone="warning">{n.outdated}</Alert>}
      {prefill &&
        params.has('yerimi') &&
        !prefill.values.jobDescription &&
        !prefill.rejected.includes('description') && (
          <Alert tone="warning">{n.noDescription}</Alert>
        )}
      {prefill && prefill.rejected.length > 0 && (
        <Alert tone="warning">
          {n.rejected(
            prefill.rejected.map((name) => fieldLabel[name].replace(' *', '')).join(', '),
          )}
        </Alert>
      )}
      <Card title={n.card}>
        <p className="mb-4 text-sm text-ink-muted">{n.requiredNote}</p>
        <ApplicationForm
          {...(prefill ? { prefill: prefill.values } : {})}
          submitLabel={n.submit}
          pending={create.isPending || saveJob.isPending}
          serverError={create.isError ? errorMessage(create.error) : null}
          onSubmit={(input) => {
            create.mutate(input, {
              onSuccess: (created) => {
                const text = jobDescription.trim();
                if (!text) {
                  void navigate(`/basvurular/${created.id}`);
                  return;
                }
                saveJob.mutate(
                  { applicationId: created.id, jobDescription: text },
                  {
                    onSuccess: () => {
                      void navigate(`/basvurular/${created.id}`);
                    },
                    onError: () => {
                      setCreatedId(created.id);
                    },
                  },
                );
              },
            });
          }}
          onCancel={() => {
            void navigate('/');
          }}
        />
      </Card>
      <Card title={n.jobCard}>
        <TextAreaField
          label={n.jobLabel}
          hint={n.jobHint}
          rows={10}
          maxLength={JOB_DESCRIPTION_MAX}
          value={jobDescription}
          onChange={(event) => {
            setJobDescription(event.target.value);
          }}
        />
      </Card>
    </div>
  );
}
