import { useEffect, useState, type SubmitEvent } from 'react';
import { CV_FILE_MAX_BYTES, cvVersionCreateSchema, type CvVersion } from '@jobtrack/shared';
import { FileDropZone, preventStrayFileDrops } from '../../components/FileDropZone';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  PageHeader,
  PRIMARY_LINK,
  SHEET,
} from '../../components/ui';
import { useI18n } from '../../i18n';
import { formText } from '../../lib/api';
import { labelFromFileName } from '../../lib/cv-file';
import { usePickCvFile } from '../../lib/use-pick-cv-file';
import {
  useCreateCvVersion,
  useCvVersions,
  useDeleteCvFile,
  useDeleteCvVersion,
  useReplaceCvFile,
  useUpdateCvVersion,
  useUploadCvVersion,
} from '../../lib/queries';

const ACCEPT = 'application/pdf,.pdf';

/** FR-08: CV versiyonları ve PDF dosyaları (ADR-0006). */
export function CvVersionsPage() {
  const { t, errorMessage } = useI18n();
  const cvVersions = useCvVersions();
  useEffect(preventStrayFileDrops, []);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t.cv.title} count={cvVersions.data?.length} />
      <AddCvCard />
      {cvVersions.isError && <Alert>{errorMessage(cvVersions.error)}</Alert>}
      {cvVersions.data?.length === 0 && <EmptyState>{t.cv.empty}</EmptyState>}
      {cvVersions.data && cvVersions.data.length > 0 && (
        <ul className={`${SHEET} divide-y divide-line p-2`}>
          {cvVersions.data.map((cv) => (
            <CvVersionItem key={cv.id} cv={cv} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddCvCard() {
  const { t, formatFileSize, errorMessage, issueMessage } = useI18n();
  const upload = useUploadCvVersion();
  const create = useCreateCvVersion();
  const pickFile = usePickCvFile();
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = upload.isPending || create.isPending;

  const done = (created: CvVersion) => {
    setLabel('');
    setNotice(t.cv.uploaded(created.label));
  };

  const onFiles = async (files: File[]) => {
    setError(null);
    setNotice(null);
    const picked = await pickFile(files);
    if ('problem' in picked) {
      setError(picked.problem);
      return;
    }
    // Yazılmış etiket varsa o, yoksa dosya adı kullanılır; çakışırsa etiket düzeltilip tekrar bırakılır.
    const finalLabel = label.trim() || labelFromFileName(picked.file.name);
    upload.mutate(
      { label: finalLabel, file: picked.file },
      {
        onSuccess: done,
        onError: (err) => {
          setLabel(finalLabel);
          setError(errorMessage(err));
        },
      },
    );
  };

  const addWithoutFile = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    if (!label.trim()) {
      setError(t.cv.labelRequired);
      return;
    }
    const parsed = cvVersionCreateSchema.safeParse({ label });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue ? issueMessage(issue) : t.common.invalidForm);
      return;
    }
    setError(null);
    create.mutate(parsed.data, {
      onSuccess: done,
      onError: (err) => {
        setError(errorMessage(err));
      },
    });
  };

  return (
    <Card title={t.cv.addCard}>
      <div className="flex flex-col gap-4">
        <FileDropZone
          accept={ACCEPT}
          disabled={pending}
          chooseLabel={t.cv.chooseFile}
          onFiles={(files) => void onFiles(files)}
          className="rounded-xl border-2 border-dashed border-line-strong bg-surface-muted px-4 py-12 text-center transition-[background-color,border-color,transform] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        >
          {({ active, chooseButton }) => (
            <div className="flex flex-col items-center gap-3">
              <PdfIcon
                className={`size-10 transition-[transform,color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${active ? '-translate-y-1.5 scale-110 -rotate-6 text-lilac-solid' : 'text-ink-muted'}`}
              />
              <p className="font-medium text-ink">
                {pending && upload.variables
                  ? t.cv.uploading(upload.variables.file.name)
                  : active
                    ? t.cv.dropActive
                    : t.cv.dropTitle}
              </p>
              <p className="text-sm text-ink-muted">
                {t.cv.dropHint(formatFileSize(CV_FILE_MAX_BYTES))}
              </p>
              {chooseButton}
            </div>
          )}
        </FileDropZone>

        <div aria-live="polite">
          {error && <Alert>{error}</Alert>}
          {notice && !error && <Alert tone="success">{notice}</Alert>}
        </div>

        <form noValidate onSubmit={addWithoutFile} className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <Field
              label={t.cv.label}
              name="label"
              placeholder={t.cv.labelPlaceholder}
              hint={t.cv.labelHint}
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
              }}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending} className="mb-5">
            {t.cv.addWithoutFile}
          </Button>
        </form>
      </div>
    </Card>
  );
}

function CvVersionItem({ cv }: { cv: CvVersion }) {
  const { t, formatDate, formatFileSize, errorMessage } = useI18n();
  const update = useUpdateCvVersion();
  const remove = useDeleteCvVersion();
  const replace = useReplaceCvFile();
  const removeFile = useDeleteCvFile();
  const pickFile = usePickCvFile();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'version' | 'file' | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const onFiles = async (files: File[]) => {
    setFileError(null);
    const picked = await pickFile(files);
    if ('problem' in picked) {
      setFileError(picked.problem);
      return;
    }
    replace.mutate(
      { id: cv.id, file: picked.file },
      {
        onError: (err) => {
          setFileError(errorMessage(err));
        },
      },
    );
  };

  if (editing) {
    return (
      <li className="p-4">
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = cvVersionCreateSchema.safeParse({
              label: formText(event.currentTarget, 'label'),
            });
            if (!parsed.success) return;
            update.mutate(
              { id: cv.id, body: { label: parsed.data.label } },
              {
                onSuccess: () => {
                  setEditing(false);
                },
              },
            );
          }}
        >
          {update.isError && <Alert>{errorMessage(update.error)}</Alert>}
          <div className="max-w-sm">
            <Field label={t.cv.label} name="label" required defaultValue={cv.label} />
          </div>
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
      </li>
    );
  }

  return (
    <li>
      <FileDropZone
        accept={ACCEPT}
        disabled={replace.isPending}
        chooseLabel={cv.file ? t.cv.replace : t.cv.attach}
        chooseAriaLabel={cv.file ? t.cv.replaceLabel(cv.label) : t.cv.attachLabel(cv.label)}
        onFiles={(files) => void onFiles(files)}
        className="flex flex-col gap-3 rounded-lg border-2 border-transparent px-3 py-4 text-sm transition-[background-color,border-color] duration-300"
        activeClassName="!border-dashed !border-focus bg-lilac"
      >
        {({ active, chooseButton }) => (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <PdfIcon
                  className={`size-7 shrink-0 ${cv.file ? 'text-ink' : 'text-ink-muted opacity-50'}`}
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">{cv.label}</p>
                  <p className="truncate text-xs text-ink-muted">
                    {active
                      ? t.cv.dropToReplace
                      : [
                          cv.file
                            ? `${cv.fileName ?? ''} · ${t.cv.fileInfo(
                                formatFileSize(cv.file.sizeBytes),
                                formatDate(cv.file.uploadedAt.slice(0, 10)),
                              )}`
                            : t.cv.noFile,
                          t.common.applicationCount(cv.applicationCount),
                        ].join(' · ')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {cv.file && (
                  <a
                    href={`/api/cv-versions/${cv.id}/file`}
                    download
                    aria-label={t.cv.downloadLabel(cv.label)}
                    className={PRIMARY_LINK}
                  >
                    {t.cv.download}
                  </a>
                )}
                {chooseButton}
                {cv.file && (
                  <Button
                    variant="ghost"
                    aria-label={t.cv.removeFileLabel(cv.label)}
                    onClick={() => {
                      setConfirm('file');
                    }}
                  >
                    {t.cv.removeFile}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  aria-label={t.cv.editLabel(cv.label)}
                  onClick={() => {
                    setEditing(true);
                  }}
                >
                  {t.common.edit}
                </Button>
                <Button
                  variant="ghost"
                  aria-label={t.cv.deleteLabel(cv.label)}
                  onClick={() => {
                    setConfirm('version');
                  }}
                >
                  {t.common.delete}
                </Button>
              </div>
            </div>
            {fileError && <Alert>{fileError}</Alert>}
          </>
        )}
      </FileDropZone>
      <ConfirmDialog
        open={confirm === 'version'}
        title={t.cv.deleteTitle}
        description={
          cv.applicationCount > 0
            ? t.cv.deleteUsed(cv.label, cv.applicationCount)
            : t.cv.deleteUnused(cv.label)
        }
        confirmLabel={t.common.delete}
        pending={remove.isPending}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          remove.mutate(cv.id, {
            onSettled: () => {
              setConfirm(null);
            },
          });
        }}
      />
      <ConfirmDialog
        open={confirm === 'file'}
        title={t.cv.removeFileTitle}
        description={t.cv.removeFileDescription(cv.label)}
        confirmLabel={t.cv.removeFile}
        pending={removeFile.isPending}
        onCancel={() => {
          setConfirm(null);
        }}
        onConfirm={() => {
          removeFile.mutate(cv.id, {
            onSettled: () => {
              setConfirm(null);
            },
          });
        }}
      />
    </li>
  );
}

function PdfIcon({ className }: { className: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
