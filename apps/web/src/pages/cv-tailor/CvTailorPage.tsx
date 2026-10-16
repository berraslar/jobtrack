import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  MASTER_CV_MAX,
  type Application,
  type TailorDraft,
  type TailoredCv,
} from '@jobtrack/shared';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  PageHeader,
  SelectField,
  TextAreaField,
} from '../../components/ui';
import { FileDropZone, preventStrayFileDrops } from '../../components/FileDropZone';
import { useI18n } from '../../i18n';
import { downloadText, fileSlug } from '../../lib/download';
import {
  useAiStatus,
  useApplications,
  useCreateTailoredCv,
  useDeleteTailoredCv,
  useImportMasterCv,
  useJobDescription,
  useMasterCv,
  useSaveJobDescription,
  useSaveMasterCv,
  useTailor,
  useTailoredCvs,
  useUpdateTailoredCv,
} from '../../lib/queries';
import { usePickCvFile } from '../../lib/use-pick-cv-file';
import { CvEditor, CvPreview, CvPrintArea } from './CvEditor';
import { DiffView } from './DiffView';

/**
 * FR-23, FR-24 (ADR-0010): Ana CV, başvuruya bağlı ilan metni, yapay zekâ ile uyarlama (açık
 * onayla), yan yana fark, düzenleme, sürümler ve dışa aktarma (Markdown, yazdırma ile PDF).
 */
export function CvTailorPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const applications = useApplications({});
  const selectedId = params.get('basvuru');
  const selected = applications.data?.find((a) => a.id === selectedId) ?? null;
  const [printing, setPrinting] = useState<string | null>(null);
  useEffect(preventStrayFileDrops, []);

  // Yazdırma görünümü: yalnızca .print-area görünür (index.css); pencere kapanınca temizlenir.
  useEffect(() => {
    if (printing === null) return;
    const done = () => {
      setPrinting(null);
    };
    window.addEventListener('afterprint', done, { once: true });
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <PageHeader title={t.cvTailor.title} />
      <MasterCvCard onPrint={setPrinting} />
      <Card title={t.cvTailor.pick.card}>
        {applications.data?.length === 0 ? (
          <EmptyState>{t.cvTailor.pick.noApplications}</EmptyState>
        ) : (
          <div className="max-w-md">
            <SelectField
              label={t.cvTailor.pick.application}
              value={selected?.id ?? ''}
              onChange={(event) => {
                const next = new URLSearchParams(params);
                if (event.target.value) next.set('basvuru', event.target.value);
                else next.delete('basvuru');
                setParams(next, { replace: true });
              }}
            >
              <option value="">{t.cvTailor.pick.choose}</option>
              {applications.data?.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.company.name} – {application.positionTitle}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        {selected && <JobDescriptionEditor key={selected.id} applicationId={selected.id} />}
      </Card>
      {selected && (
        <>
          <TailorCard key={`tailor-${selected.id}`} application={selected} onPrint={setPrinting} />
          <VersionsCard
            key={`versions-${selected.id}`}
            application={selected}
            onPrint={setPrinting}
          />
        </>
      )}
      {printing !== null && <CvPrintArea source={printing} />}
    </div>
  );
}

function MasterCvCard({ onPrint }: { onPrint: (markdown: string) => void }) {
  const { t, formatDateTime, errorMessage } = useI18n();
  const m = t.cvTailor.master;
  const master = useMasterCv();
  const save = useSaveMasterCv();
  const importCv = useImportMasterCv();
  const pickFile = usePickCvFile();
  const [draft, setDraft] = useState<string | null>(null);
  /** PDF'ten okunan taslağın yöntemi; taslak kaydedilince ya da kapatılınca temizlenir. */
  const [imported, setImported] = useState<'text' | 'ocr' | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const editing = draft !== null || (master.data !== undefined && master.data.markdown === '');
  const savedMarkdown = master.data?.markdown ?? '';
  const value = draft ?? savedMarkdown;

  return (
    <Card
      title={m.card}
      actions={
        master.data?.markdown && draft === null ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(savedMarkdown);
              }}
            >
              {m.edit}
            </Button>
            <Button
              onClick={() => {
                onPrint(savedMarkdown);
              }}
            >
              {t.cvTailor.versions.pdf}
            </Button>
          </div>
        ) : null
      }
    >
      <p className="mb-4 max-w-[65ch] text-sm text-ink-muted">{m.intro}</p>
      <FileDropZone
        accept="application/pdf,.pdf"
        disabled={importCv.isPending}
        chooseLabel={m.choose}
        onFiles={(files) =>
          void (async () => {
            setFileError(null);
            const picked = await pickFile(files);
            if ('problem' in picked) {
              setFileError(picked.problem);
              return;
            }
            importCv.mutate(picked.file, {
              onSuccess: (result) => {
                setDraft(result.markdown);
                setImported(result.method);
              },
            });
          })()
        }
        className="mb-4 rounded-xl border-2 border-dashed border-line-strong bg-surface-muted px-4 py-6 text-center transition-[background-color,border-color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        {({ chooseButton }) => (
          <div className="flex flex-col items-center gap-2">
            <p className="font-medium text-ink">
              {importCv.isPending ? m.reading(importCv.variables.name) : m.drop}
            </p>
            <p className="text-xs text-ink-muted">{m.dropHint}</p>
            {chooseButton}
          </div>
        )}
      </FileDropZone>
      <div aria-live="polite">
        {fileError && <Alert>{fileError}</Alert>}
        {importCv.isError && <Alert>{errorMessage(importCv.error)}</Alert>}
        {imported && draft !== null && (
          <Alert tone={imported === 'ocr' ? 'warning' : 'success'}>
            {imported === 'ocr' ? m.importedOcr : m.imported}
          </Alert>
        )}
      </div>
      {master.isError && <Alert>{errorMessage(master.error)}</Alert>}
      {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && draft === null && <Alert tone="success">{m.saved}</Alert>}
      {editing ? (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(value, {
              onSuccess: () => {
                setDraft(null);
                setImported(null);
              },
            });
          }}
        >
          <CvEditor
            label={m.label}
            value={value}
            hint={`${t.cvTailor.preview.syntax} ${m.count(value.length.toLocaleString(), MASTER_CV_MAX.toLocaleString())}`}
            onChange={setDraft}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending || value.trim() === ''}>
              {m.save}
            </Button>
            {draft !== null && master.data?.markdown && (
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setImported(null);
                }}
              >
                {m.close}
              </Button>
            )}
          </div>
        </form>
      ) : master.data ? (
        <>
          {master.data.updatedAt && (
            <p className="mb-3 text-xs text-ink-muted">
              {m.lastSaved(formatDateTime(master.data.updatedAt))}
            </p>
          )}
          {master.data.markdown && <CvPreview source={master.data.markdown} />}
        </>
      ) : null}
      {!editing && master.data?.markdown === '' && <EmptyState>{m.empty}</EmptyState>}
    </Card>
  );
}

function JobDescriptionEditor({ applicationId }: { applicationId: string }) {
  const { t, errorMessage } = useI18n();
  const p = t.cvTailor.pick;
  const job = useJobDescription(applicationId);
  const save = useSaveJobDescription(applicationId);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? job.data?.jobDescription ?? '';
  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(value, {
          onSuccess: () => {
            setDraft(null);
          },
        });
      }}
    >
      <TextAreaField
        label={p.job}
        hint={p.jobHint}
        rows={10}
        maxLength={20_000}
        value={value}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
      {save.isError && <Alert>{errorMessage(save.error)}</Alert>}
      {save.isSuccess && draft === null && <Alert tone="success">{p.jobSaved}</Alert>}
      <div>
        <Button type="submit" variant="secondary" disabled={save.isPending || draft === null}>
          {p.saveJob}
        </Button>
      </div>
    </form>
  );
}

function TailorCard({
  application,
  onPrint,
}: {
  application: Application;
  onPrint: (markdown: string) => void;
}) {
  const { t, errorMessage } = useI18n();
  const a = t.cvTailor.ai;
  const status = useAiStatus();
  const master = useMasterCv();
  const job = useJobDescription(application.id);
  const tailor = useTailor(application.id);
  const [consent, setConsent] = useState(false);
  const [extraTerms, setExtraTerms] = useState('');
  const [onePage, setOnePage] = useState(true);
  const onePageId = useId();
  const [draft, setDraft] = useState<TailorDraft | null>(null);
  const consentId = useId();
  const hintId = useId();

  const masterText = master.data?.markdown ?? '';
  const hasJob = Boolean(job.data?.jobDescription?.trim());
  const hasMaster = masterText.trim() !== '';
  const enabled = status.data?.enabled === true;

  const startManual = () => {
    setDraft({
      tailoredMarkdown: masterText,
      matchScore: 0,
      missingKeywords: [],
      changes: [],
      warnings: [],
      maskedCount: 0,
      model: '',
    });
  };

  return (
    <Card title={a.card}>
      {!enabled && status.data && <Alert tone="warning">{a.disabled}</Alert>}
      {!hasMaster && <p className="mb-3 text-sm text-ink-muted">{a.needMaster}</p>}
      {enabled && !hasJob && <p className="mb-3 text-sm text-ink-muted">{a.needJob}</p>}
      {enabled && (
        <form
          className="mt-3 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const extraMaskTerms = extraTerms
              .split(',')
              .map((term) => term.trim())
              .filter((term) => term.length >= 2);
            tailor.mutate(
              { consent: true, extraMaskTerms, onePage },
              {
                onSuccess: (result) => {
                  setDraft(result);
                },
              },
            );
          }}
        >
          <Field
            label={a.extraTerms}
            hint={a.extraTermsHint}
            value={extraTerms}
            onChange={(event) => {
              setExtraTerms(event.target.value);
            }}
          />
          <div className="flex items-start gap-3">
            <input
              id={onePageId}
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-lilac-solid"
              checked={onePage}
              onChange={(event) => {
                setOnePage(event.target.checked);
              }}
            />
            <div>
              <label htmlFor={onePageId} className="text-sm font-semibold">
                {a.onePage}
              </label>
              <p className="mt-1 text-xs text-ink-muted">{a.onePageHint}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-butter p-4">
            <input
              id={consentId}
              type="checkbox"
              aria-describedby={hintId}
              className="mt-0.5 size-5 shrink-0 accent-lilac-solid"
              checked={consent}
              onChange={(event) => {
                setConsent(event.target.checked);
              }}
            />
            <div>
              <label htmlFor={consentId} className="text-sm font-semibold">
                {a.consent}
              </label>
              <p id={hintId} className="mt-1 text-xs text-ink-muted">
                {a.consentHint}
              </p>
            </div>
          </div>
          {tailor.isError && <Alert>{errorMessage(tailor.error)}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!consent || !hasJob || !hasMaster || tailor.isPending}>
              {tailor.isPending ? a.running : a.run}
            </Button>
          </div>
          {tailor.isPending && <Elapsed format={a.elapsed} />}
        </form>
      )}
      {hasMaster && (
        <div className="mt-3">
          <Button variant="ghost" className="-ml-3" onClick={startManual}>
            {a.startManual}
          </Button>
        </div>
      )}
      {draft && (
        <DraftPanel
          application={application}
          master={masterText}
          draft={draft}
          onClose={() => {
            setDraft(null);
          }}
          onPrint={onPrint}
        />
      )}
    </Card>
  );
}

/** Uzun süren istekte ilerlemeyi gösterir; ekran okuyucuya her saniye okunmaz. */
function Elapsed({ format }: { format: (seconds: number) => string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return <p className="text-xs text-ink-muted">{format(seconds)}</p>;
}

function DraftPanel({
  application,
  master,
  draft,
  onClose,
  onPrint,
}: {
  application: Application;
  master: string;
  draft: TailorDraft;
  onClose: () => void;
  onPrint: (markdown: string) => void;
}) {
  const { t, errorMessage } = useI18n();
  const r = t.cvTailor.result;
  const create = useCreateTailoredCv(application.id);
  const [text, setText] = useState(draft.tailoredMarkdown);
  const fromAi = draft.model !== '';
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className="rise mt-6 flex flex-col gap-5 border-t border-line pt-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={headingId} className="text-lg font-semibold">
          {r.card}
        </h3>
        <Button variant="ghost" onClick={onClose}>
          {r.discard}
        </Button>
      </div>

      {fromAi && (
        <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <div className="rounded-xl bg-lilac px-5 py-4">
            <p className="text-sm font-semibold text-ink-muted">{r.score}</p>
            <p className="mt-2 font-display text-[2.5rem] leading-none font-bold">
              %{draft.matchScore}
            </p>
            <span aria-hidden className="mt-3 block h-2 overflow-hidden rounded-full bg-surface/70">
              <span
                className="grow-x block h-2 rounded-full bg-lilac-solid"
                style={{ width: `${String(draft.matchScore)}%` }}
              />
            </span>
          </div>
          <div className="flex flex-col gap-1 text-xs text-ink-muted">
            <p>{r.masked(draft.maskedCount)}</p>
            <p>{r.model(draft.model)}</p>
          </div>
        </div>
      )}

      {draft.warnings.length > 0 && (
        <Alert tone="warning">
          <p className="mb-1 font-semibold">{r.warnings}</p>
          <ul className="list-disc pl-5">
            {draft.warnings.map((warning) => (
              <li key={`${warning.kind}:${warning.text}`}>
                {r.warningKinds[warning.kind]}: {warning.text}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {fromAi && (draft.missingKeywords.length > 0 || draft.changes.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {draft.missingKeywords.length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-semibold">{r.missing}</h4>
              <p className="mb-2 text-xs text-ink-muted">{r.missingNote}</p>
              <ul className="flex flex-wrap gap-1.5">
                {draft.missingKeywords.map((keyword) => (
                  <li
                    key={keyword}
                    className="rounded-full bg-peach px-2.5 py-0.5 text-[0.8125rem] font-semibold"
                  >
                    {keyword}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {draft.changes.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">{r.changes}</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {draft.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <DiffView left={master} right={text} />

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(
            {
              markdown: text,
              matchScore: fromAi ? draft.matchScore : null,
              missingKeywords: draft.missingKeywords,
              changes: draft.changes,
              model: fromAi ? draft.model : null,
            },
            { onSuccess: onClose },
          );
        }}
      >
        <CvEditor label={r.editLabel} value={text} onChange={setText} />
        {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={create.isPending || text.trim() === ''}>
            {r.save}
          </Button>
          <Button
            variant="secondary"
            disabled={text.trim() === ''}
            onClick={() => {
              onPrint(text);
            }}
          >
            {t.cvTailor.versions.pdf}
          </Button>
        </div>
      </form>
    </section>
  );
}

function VersionsCard({
  application,
  onPrint,
}: {
  application: Application;
  onPrint: (markdown: string) => void;
}) {
  const { t, errorMessage } = useI18n();
  const v = t.cvTailor.versions;
  const versions = useTailoredCvs(application.id);
  return (
    <Card title={v.card}>
      {versions.isError && <Alert>{errorMessage(versions.error)}</Alert>}
      {versions.data?.tailoredCvs.length === 0 && <EmptyState>{v.empty}</EmptyState>}
      {versions.data && versions.data.tailoredCvs.length > 0 && (
        <>
          <p className="mb-3 text-xs text-ink-muted">{v.pdfHint}</p>
          <ul className="divide-y divide-line">
            {versions.data.tailoredCvs.map((version) => (
              <VersionItem
                key={version.id}
                application={application}
                version={version}
                onPrint={onPrint}
              />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function VersionItem({
  application,
  version,
  onPrint,
}: {
  application: Application;
  version: TailoredCv;
  onPrint: (markdown: string) => void;
}) {
  const { t, formatDateTime, errorMessage } = useI18n();
  const v = t.cvTailor.versions;
  const update = useUpdateTailoredCv(application.id);
  const remove = useDeleteTailoredCv(application.id);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const label = v.versionOf(formatDateTime(version.createdAt));

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{label}</p>
          <p className="text-xs text-ink-muted">
            {version.matchScore !== null ? v.score(version.matchScore) : v.manual}
            {version.updatedAt !== version.createdAt && ` · ${formatDateTime(version.updatedAt)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="ghost"
            aria-label={`${v.edit}: ${label}`}
            onClick={() => {
              setEditing(version.markdown);
            }}
          >
            {v.edit}
          </Button>
          <Button
            variant="secondary"
            aria-label={`${v.pdf}: ${label}`}
            onClick={() => {
              onPrint(version.markdown);
            }}
          >
            {v.pdf}
          </Button>
          <Button
            variant="ghost"
            aria-label={`${v.markdown}: ${label}`}
            onClick={() => {
              downloadText(
                `cv-${fileSlug(application.company.name)}-${fileSlug(application.positionTitle)}.md`,
                version.markdown,
              );
            }}
          >
            {v.markdown}
          </Button>
          <Button
            variant="danger-quiet"
            aria-label={`${v.delete}: ${label}`}
            onClick={() => {
              setConfirm(true);
            }}
          >
            {v.delete}
          </Button>
        </div>
      </div>
      {editing !== null && (
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate(
              { id: version.id, markdown: editing },
              {
                onSuccess: () => {
                  setEditing(null);
                },
              },
            );
          }}
        >
          <CvEditor label={v.editLabel} rows={14} value={editing} onChange={setEditing} />
          {update.isError && <Alert>{errorMessage(update.error)}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" disabled={update.isPending || editing.trim() === ''}>
              {v.save}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditing(null);
              }}
            >
              {v.cancel}
            </Button>
          </div>
        </form>
      )}
      <ConfirmDialog
        open={confirm}
        title={v.deleteTitle}
        description={v.deleteBody}
        confirmLabel={v.delete}
        pending={remove.isPending}
        onCancel={() => {
          setConfirm(false);
        }}
        onConfirm={() => {
          remove.mutate(version.id, {
            onSuccess: () => {
              setConfirm(false);
            },
          });
        }}
      />
      {remove.isError && <Alert>{errorMessage(remove.error)}</Alert>}
    </li>
  );
}
