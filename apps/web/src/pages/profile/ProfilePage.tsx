import { useId, useState, type ReactNode, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { profileUpdateSchema, type Profile, type ProfileDraft } from '@jobtrack/shared';
import {
  Alert,
  Button,
  Card,
  Field,
  LINK,
  PageHeader,
  SelectField,
  TextAreaField,
} from '../../components/ui';
import { useI18n } from '../../i18n';
import { useCvVersions, useExtractProfile, useProfile, useSaveProfile } from '../../lib/queries';
import {
  applySuggestions,
  buildSuggestions,
  emptyEducation,
  emptyExperience,
  fromForm,
  sameForm,
  toForm,
  type EducationForm,
  type ExperienceForm,
  type ProfileForm,
  type ScalarField,
  type Suggestion,
} from './profile-form';

/** FR-20: profil. FR-21: CV'den öneri; öneri onay ekranından forma, formdan "Kaydet" ile sunucuya. */
export function ProfilePage() {
  const { t, errorMessage } = useI18n();
  const profile = useProfile();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t.profile.title} />
      {profile.isPending && <p className="text-ink-muted">{t.common.loading}</p>}
      {profile.isError && <Alert>{errorMessage(profile.error)}</Alert>}
      {profile.data && <ProfileEditor saved={profile.data} />}
    </div>
  );
}

type Issues = Map<string, string>;

function ProfileEditor({ saved }: { saved: Profile }) {
  const { t, formatDateTime, errorMessage, issueMessage } = useI18n();
  const save = useSaveProfile();
  const [form, setForm] = useState<ProfileForm>(() => toForm(saved));
  const [baseline, setBaseline] = useState<ProfileForm>(() => toForm(saved));
  const [issues, setIssues] = useState<Issues>(new Map());
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = !sameForm(form, baseline);
  const f = t.profile.fields;

  const update = (patch: Partial<ProfileForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setNotice(null);
  };
  const issue = (path: string) => issues.get(path);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = profileUpdateSchema.safeParse(fromForm(form));
    if (!parsed.success) {
      const map: Issues = new Map();
      for (const i of parsed.error.issues) {
        const path = i.path.join('.');
        if (!map.has(path)) map.set(path, issueMessage(i));
        // Liste öğesi hatası (örn. skills.3) listenin alanında gösterilir.
        const head = String(i.path[0]);
        if (!map.has(head) && (head === 'skills' || head === 'languages')) {
          map.set(head, issueMessage(i));
        }
      }
      setIssues(map);
      setNotice(null);
      return;
    }
    setIssues(new Map());
    save.mutate(parsed.data, {
      onSuccess: (profile) => {
        // Sunucunun normalleştirdiği hâl (örn. küçük harfli e-posta) yeni taban olur.
        const next = toForm(profile);
        setForm(next);
        setBaseline(next);
        setNotice(t.profile.saved);
      },
    });
  };

  const scalar = (field: ScalarField, props: { type?: string; placeholder?: string } = {}) => (
    <Field
      label={f[field]}
      name={field}
      value={form[field]}
      error={issue(field)}
      autoComplete="off"
      onChange={(e) => {
        update({ [field]: e.target.value });
      }}
      {...props}
    />
  );

  const setExperience = (index: number, patch: Partial<ExperienceForm>) => {
    update({
      experience: form.experience.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    });
  };
  const setEducation = (index: number, patch: Partial<EducationForm>) => {
    update({
      education: form.education.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    });
  };

  return (
    <>
      <FillFromCv
        form={form}
        onApply={(next, count) => {
          setForm(next);
          setNotice(t.profile.fill.applied(count));
        }}
      />

      <form noValidate onSubmit={submit} className="flex flex-col gap-5">
        <Card title={t.profile.sections.identity}>
          <div className="grid gap-4 sm:grid-cols-2">
            {scalar('fullName')}
            {scalar('headline', { placeholder: t.profile.headlinePlaceholder })}
            {scalar('location')}
          </div>
        </Card>

        <Card title={t.profile.sections.contact}>
          <div className="grid gap-4 sm:grid-cols-2">
            {scalar('email', { type: 'email' })}
            {scalar('phone', { type: 'tel' })}
            {scalar('website', { type: 'url', placeholder: 'https://' })}
            {scalar('linkedin', { type: 'url', placeholder: 'https://linkedin.com/in/…' })}
            {scalar('github', { type: 'url', placeholder: 'https://github.com/…' })}
          </div>
        </Card>

        <Card title={t.profile.sections.summary}>
          <TextAreaField
            label={f.summary}
            value={form.summary}
            rows={5}
            maxLength={4000}
            error={issue('summary')}
            onChange={(e) => {
              update({ summary: e.target.value });
            }}
          />
        </Card>

        <Card title={t.profile.sections.skills}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAreaField
              label={f.skills}
              hint={t.profile.listHint}
              value={form.skills}
              rows={3}
              error={issue('skills')}
              onChange={(e) => {
                update({ skills: e.target.value });
              }}
            />
            <TextAreaField
              label={f.languages}
              hint={t.profile.listHint}
              value={form.languages}
              rows={3}
              error={issue('languages')}
              onChange={(e) => {
                update({ languages: e.target.value });
              }}
            />
          </div>
        </Card>

        <Card
          title={t.profile.sections.experience}
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                update({ experience: [...form.experience, emptyExperience()] });
              }}
            >
              {t.profile.addExperience}
            </Button>
          }
        >
          {form.experience.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.profile.noExperience}</p>
          ) : (
            <ol className="flex flex-col">
              {form.experience.map((entry, index) => (
                <EntryShell
                  key={entry.key}
                  title={t.profile.experienceN(index + 1)}
                  removeLabel={t.profile.removeExperience(index + 1)}
                  onRemove={() => {
                    update({ experience: form.experience.filter((_, i) => i !== index) });
                  }}
                >
                  <Field
                    label={f.title}
                    value={entry.title}
                    error={issue(`experience.${String(index)}.title`)}
                    onChange={(e) => {
                      setExperience(index, { title: e.target.value });
                    }}
                  />
                  <Field
                    label={f.company}
                    value={entry.company}
                    error={issue(`experience.${String(index)}.company`)}
                    onChange={(e) => {
                      setExperience(index, { company: e.target.value });
                    }}
                  />
                  <DateRange
                    start={entry.start}
                    end={entry.end}
                    current={entry.current}
                    startError={issue(`experience.${String(index)}.start`)}
                    endError={issue(`experience.${String(index)}.end`)}
                    onChange={(patch) => {
                      setExperience(index, patch);
                    }}
                  />
                  <div className="sm:col-span-2">
                    <TextAreaField
                      label={f.description}
                      value={entry.description}
                      rows={3}
                      maxLength={2000}
                      error={issue(`experience.${String(index)}.description`)}
                      onChange={(e) => {
                        setExperience(index, { description: e.target.value });
                      }}
                    />
                  </div>
                </EntryShell>
              ))}
            </ol>
          )}
        </Card>

        <Card
          title={t.profile.sections.education}
          actions={
            <Button
              variant="secondary"
              onClick={() => {
                update({ education: [...form.education, emptyEducation()] });
              }}
            >
              {t.profile.addEducation}
            </Button>
          }
        >
          {form.education.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.profile.noEducation}</p>
          ) : (
            <ol className="flex flex-col">
              {form.education.map((entry, index) => (
                <EntryShell
                  key={entry.key}
                  title={t.profile.educationN(index + 1)}
                  removeLabel={t.profile.removeEducation(index + 1)}
                  onRemove={() => {
                    update({ education: form.education.filter((_, i) => i !== index) });
                  }}
                >
                  <Field
                    label={f.school}
                    value={entry.school}
                    error={issue(`education.${String(index)}.school`)}
                    onChange={(e) => {
                      setEducation(index, { school: e.target.value });
                    }}
                  />
                  <Field
                    label={f.degree}
                    value={entry.degree}
                    error={issue(`education.${String(index)}.degree`)}
                    onChange={(e) => {
                      setEducation(index, { degree: e.target.value });
                    }}
                  />
                  <DateRange
                    start={entry.start}
                    end={entry.end}
                    startError={issue(`education.${String(index)}.start`)}
                    endError={issue(`education.${String(index)}.end`)}
                    onChange={(patch) => {
                      setEducation(index, patch);
                    }}
                  />
                </EntryShell>
              ))}
            </ol>
          )}
        </Card>

        {/* Kayıt şeridi: sayfa kaydırılsa da kaydet düğmesi ve durum görünür kalır. */}
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-full bg-surface/95 py-2 pr-2 pl-5 shadow-lift ring-1 ring-line">
          <div className="min-w-0 text-sm" aria-live="polite">
            {issues.size > 0 ? (
              <span className="font-medium text-danger">{t.profile.invalid}</span>
            ) : save.isError ? (
              <span className="font-medium text-danger">{errorMessage(save.error)}</span>
            ) : notice ? (
              <span className="text-ink">{notice}</span>
            ) : dirty ? (
              <span className="inline-flex items-center gap-1.5 text-ink">
                <span aria-hidden className="size-2 animate-pulse rounded-full bg-signal" />
                {t.profile.unsaved}
              </span>
            ) : (
              <span className="text-ink-muted">
                {saved.updatedAt
                  ? t.profile.lastSaved(formatDateTime(saved.updatedAt))
                  : t.profile.neverSaved}
              </span>
            )}
          </div>
          <Button type="submit" disabled={save.isPending || !dirty}>
            {save.isPending ? t.common.saving : t.profile.save}
          </Button>
        </div>
      </form>
    </>
  );
}

function EntryShell({
  title,
  removeLabel,
  onRemove,
  children,
}: {
  title: string;
  removeLabel: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <li aria-labelledby={id} className="border-b border-line py-5 first:pt-0 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 id={id} className="text-[0.8125rem] font-semibold text-ink-muted">
          {title}
        </h3>
        <Button variant="ghost" aria-label={removeLabel} onClick={onRemove}>
          {t.profile.remove}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </li>
  );
}

function DateRange({
  start,
  end,
  current,
  startError,
  endError,
  onChange,
}: {
  start: string;
  end: string;
  current?: boolean;
  startError?: string | undefined;
  endError?: string | undefined;
  onChange: (patch: { start?: string; end?: string; current?: boolean }) => void;
}) {
  const { t } = useI18n();
  const f = t.profile.fields;
  return (
    <div className="grid grid-cols-2 gap-4 sm:col-span-2 sm:grid-cols-[repeat(2,minmax(0,12rem))_auto] sm:items-start">
      <Field
        label={f.start}
        hint={t.profile.dateHint}
        value={start}
        inputMode="numeric"
        placeholder="2021-03"
        error={startError}
        onChange={(e) => {
          onChange({ start: e.target.value });
        }}
      />
      <Field
        label={f.end}
        hint={t.profile.dateHint}
        value={current ? '' : end}
        placeholder={current ? t.profile.present : '2023-08'}
        inputMode="numeric"
        disabled={current}
        error={endError}
        onChange={(e) => {
          onChange({ end: e.target.value });
        }}
      />
      {current !== undefined && (
        <label className="col-span-2 flex min-h-10 items-center gap-2 text-sm text-ink sm:col-span-1 sm:mt-6">
          <input
            type="checkbox"
            className="size-4 accent-lilac-solid"
            checked={current}
            onChange={(e) => {
              onChange({ current: e.target.checked });
            }}
          />
          {f.current}
        </label>
      )}
    </div>
  );
}

/** FR-21: CV seçimi, okuma ve onay ekranı. Onay yalnızca formu değiştirir; kayıt ayrı adımdır. */
function FillFromCv({
  form,
  onApply,
}: {
  form: ProfileForm;
  onApply: (next: ProfileForm, count: number) => void;
}) {
  const { t, errorMessage } = useI18n();
  const fill = t.profile.fill;
  const cvVersions = useCvVersions();
  const extract = useExtractProfile();
  const withFile = (cvVersions.data ?? []).filter((cv) => cv.file);
  const [cvId, setCvId] = useState('');
  const [review, setReview] = useState<{
    draft: ProfileDraft;
    suggestions: Suggestion[];
    selected: Set<string>;
  } | null>(null);
  const chosen = cvId || withFile[0]?.id || '';

  const read = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!chosen) return;
    setReview(null);
    extract.mutate(chosen, {
      onSuccess: (draft) => {
        setReview({ draft, ...buildSuggestions(form, draft.draft) });
      },
    });
  };

  const toggle = (id: string, on: boolean) => {
    if (!review) return;
    const selected = new Set(review.selected);
    if (on) selected.add(id);
    else selected.delete(id);
    setReview({ ...review, selected });
  };

  return (
    <Card title={fill.title}>
      <div className="flex flex-col gap-5">
        <p className="max-w-[62ch] text-sm text-ink-muted">{fill.intro}</p>
        {cvVersions.isError && <Alert>{errorMessage(cvVersions.error)}</Alert>}
        {cvVersions.data && withFile.length === 0 ? (
          <p className="text-sm text-ink">
            {fill.noFiles}{' '}
            <Link to="/cv" className={LINK}>
              {fill.addCv}
            </Link>
          </p>
        ) : (
          <form onSubmit={read} className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-80">
              <SelectField
                label={fill.cv}
                value={chosen}
                disabled={extract.isPending || !cvVersions.data}
                onChange={(e) => {
                  setCvId(e.target.value);
                }}
              >
                {withFile.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.label}
                  </option>
                ))}
              </SelectField>
            </div>
            <Button type="submit" variant="secondary" disabled={!chosen || extract.isPending}>
              {fill.read}
            </Button>
          </form>
        )}
        {extract.isPending && (
          <p role="status" className="text-sm text-ink">
            {fill.reading}
          </p>
        )}
        {extract.isError && <Alert>{errorMessage(extract.error)}</Alert>}
        {review && (
          <ReviewPanel
            review={review}
            onToggle={toggle}
            onSelectAll={(all) => {
              setReview({
                ...review,
                selected: new Set(all ? review.suggestions.map((s) => s.id) : []),
              });
            }}
            onDiscard={() => {
              setReview(null);
            }}
            onApply={() => {
              onApply(
                applySuggestions(form, review.suggestions, review.selected),
                review.selected.size,
              );
              setReview(null);
            }}
          />
        )}
      </div>
    </Card>
  );
}

function ReviewPanel({
  review,
  onToggle,
  onSelectAll,
  onDiscard,
  onApply,
}: {
  review: { draft: ProfileDraft; suggestions: Suggestion[]; selected: Set<string> };
  onToggle: (id: string, on: boolean) => void;
  onSelectAll: (all: boolean) => void;
  onDiscard: () => void;
  onApply: () => void;
}) {
  const { t } = useI18n();
  const fill = t.profile.fill;
  const headingId = useId();
  const { suggestions, selected, draft } = review;

  return (
    <section aria-labelledby={headingId} className="rise rounded-xl bg-lilac p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="text-base font-semibold text-ink">
          {fill.reviewTitle}
        </h3>
        <p className="text-xs text-ink-muted">{fill.method[draft.method]}</p>
      </div>
      {suggestions.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="text-sm text-ink">{fill.nothing}</p>
          <Button variant="ghost" onClick={onDiscard}>
            {t.common.cancel}
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-4 max-w-[62ch] text-sm text-ink-muted">{fill.reviewHint}</p>
          <div className="mb-2 flex gap-1">
            <Button
              variant="ghost"
              className="-ml-3"
              onClick={() => {
                onSelectAll(true);
              }}
            >
              {fill.selectAll}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                onSelectAll(false);
              }}
            >
              {fill.selectNone}
            </Button>
          </div>
          <ul className="divide-y divide-line rounded-lg bg-surface px-4">
            {suggestions.map((s) => (
              <SuggestionRow
                key={s.id}
                suggestion={s}
                checked={selected.has(s.id)}
                onChange={(on) => {
                  onToggle(s.id, on);
                }}
              />
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={selected.size === 0} onClick={onApply}>
              {fill.apply(selected.size)}
            </Button>
            <Button variant="ghost" onClick={onDiscard}>
              {fill.discard}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function SuggestionRow({
  suggestion: s,
  checked,
  onChange,
}: {
  suggestion: Suggestion;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  const { t } = useI18n();
  const fill = t.profile.fill;
  const f = t.profile.fields;
  const range = (start: string | null, end: string | null, current?: boolean) =>
    [start, current ? t.profile.present : end].filter(Boolean).join(' – ');

  let label: string;
  let body: ReactNode;
  switch (s.kind) {
    case 'field':
      label = f[s.field];
      body = (
        <>
          <span className="block break-words text-ink">{s.proposed}</span>
          <span className="block text-xs text-ink-muted">
            {fill.current}:{' '}
            {s.current ? <span className="line-through">{s.current}</span> : fill.blank}
          </span>
        </>
      );
      break;
    case 'skill':
    case 'language':
      label = s.kind === 'skill' ? fill.newSkill : fill.newLanguage;
      body = <span className="text-ink">{s.value}</span>;
      break;
    case 'experience':
      label = fill.newExperience;
      body = (
        <>
          <span className="block text-ink">
            {[s.entry.title, s.entry.company].filter(Boolean).join(' · ') || t.common.none}
          </span>
          <span className="block text-xs text-ink-muted">
            {range(s.entry.start, s.entry.end, s.entry.current)}
          </span>
        </>
      );
      break;
    case 'education':
      label = fill.newEducation;
      body = (
        <>
          <span className="block text-ink">
            {[s.entry.school, s.entry.degree].filter(Boolean).join(' · ') || t.common.none}
          </span>
          <span className="block text-xs text-ink-muted">{range(s.entry.start, s.entry.end)}</span>
        </>
      );
      break;
  }

  return (
    <li className="border-b border-line">
      <label className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 py-3 sm:grid-cols-[1rem_10rem_minmax(0,1fr)]">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-lilac-solid"
          checked={checked}
          onChange={(e) => {
            onChange(e.target.checked);
          }}
        />
        <span className="text-[0.8125rem] font-medium text-ink-muted">{label}</span>
        <span className="col-start-2 text-sm sm:col-start-3 sm:row-start-1">{body}</span>
      </label>
    </li>
  );
}
