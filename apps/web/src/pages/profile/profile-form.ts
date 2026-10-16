import type { Education, Experience, Profile, ProfileUpdate } from '@jobtrack/shared';

// FR-20/FR-21: profil formunun durumu ve CV önerilerinin forma aktarımı. Arayüzden bağımsız saf
// fonksiyonlardır; sayfa yalnızca bunları çağırır.

export const SCALAR_FIELDS = [
  'fullName',
  'headline',
  'location',
  'email',
  'phone',
  'website',
  'linkedin',
  'github',
  'summary',
] as const;
export type ScalarField = (typeof SCALAR_FIELDS)[number];

export interface ExperienceForm {
  key: string;
  title: string;
  company: string;
  start: string;
  end: string;
  current: boolean;
  description: string;
}

export interface EducationForm {
  key: string;
  school: string;
  degree: string;
  start: string;
  end: string;
}

export type ProfileForm = Record<ScalarField, string> & {
  skills: string;
  languages: string;
  experience: ExperienceForm[];
  education: EducationForm[];
};

let nextKey = 0;
/** Liste öğelerinin React anahtarı; yalnızca istemcide yaşar, sunucuya gitmez. */
const newKey = () => `k${String(++nextKey)}`;

const listText = (items: string[]) => items.join(', ');

export function splitList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const experienceToForm = (e: Experience): ExperienceForm => ({
  key: newKey(),
  title: e.title ?? '',
  company: e.company ?? '',
  start: e.start ?? '',
  end: e.end ?? '',
  current: e.current,
  description: e.description ?? '',
});

export const educationToForm = (e: Education): EducationForm => ({
  key: newKey(),
  school: e.school ?? '',
  degree: e.degree ?? '',
  start: e.start ?? '',
  end: e.end ?? '',
});

export const emptyExperience = (): ExperienceForm =>
  experienceToForm({
    title: null,
    company: null,
    start: null,
    end: null,
    current: false,
    description: null,
  });

export const emptyEducation = (): EducationForm =>
  educationToForm({ school: null, degree: null, start: null, end: null });

export function toForm(profile: Profile | ProfileUpdate): ProfileForm {
  const scalars = Object.fromEntries(
    SCALAR_FIELDS.map((field) => [field, profile[field] ?? '']),
  ) as Record<ScalarField, string>;
  return {
    ...scalars,
    skills: listText(profile.skills),
    languages: listText(profile.languages),
    experience: profile.experience.map(experienceToForm),
    education: profile.education.map(educationToForm),
  };
}

const dateOrNull = (value: string) => (value.trim() === '' ? null : value.trim());

/** Şemaya gönderilecek ham değer; boş metinleri şema null'a çevirir, tarihler burada çevrilir. */
export function fromForm(form: ProfileForm) {
  return {
    ...Object.fromEntries(SCALAR_FIELDS.map((field) => [field, form[field]])),
    skills: splitList(form.skills),
    languages: splitList(form.languages),
    experience: form.experience.map((e) => ({
      title: e.title,
      company: e.company,
      start: dateOrNull(e.start),
      end: e.current ? null : dateOrNull(e.end),
      current: e.current,
      description: e.description,
    })),
    education: form.education.map((e) => ({
      school: e.school,
      degree: e.degree,
      start: dateOrNull(e.start),
      end: dateOrNull(e.end),
    })),
  };
}

const same = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('tr') === b.trim().toLocaleLowerCase('tr');

export type Suggestion =
  | { id: string; kind: 'field'; field: ScalarField; current: string; proposed: string }
  | { id: string; kind: 'skill' | 'language'; value: string }
  | { id: string; kind: 'experience'; entry: Experience }
  | { id: string; kind: 'education'; entry: Education };

/**
 * Öneriyi formdaki mevcut değerlerle karşılaştırır. Aynı olanlar gösterilmez; boş alanı dolduran
 * ve listeye yeni öğe ekleyen öneriler işaretli, dolu bir alanı değiştirecek olanlar işaretsiz gelir.
 */
export function buildSuggestions(
  form: ProfileForm,
  draft: ProfileUpdate,
): { suggestions: Suggestion[]; selected: Set<string> } {
  const suggestions: Suggestion[] = [];
  const selected = new Set<string>();
  const add = (s: Suggestion, checked: boolean) => {
    suggestions.push(s);
    if (checked) selected.add(s.id);
  };

  for (const field of SCALAR_FIELDS) {
    const proposed = draft[field];
    const current = form[field];
    if (proposed && !same(proposed, current)) {
      add({ id: `field:${field}`, kind: 'field', field, current, proposed }, current.trim() === '');
    }
  }
  for (const kind of ['skill', 'language'] as const) {
    const existing = splitList(kind === 'skill' ? form.skills : form.languages);
    const proposed = kind === 'skill' ? draft.skills : draft.languages;
    proposed
      .filter((value) => !existing.some((item) => same(item, value)))
      .forEach((value, i) => {
        add({ id: `${kind}:${String(i)}`, kind, value }, true);
      });
  }
  draft.experience
    .filter(
      (entry) =>
        !form.experience.some(
          (e) => same(e.title, entry.title ?? '') && same(e.company, entry.company ?? ''),
        ),
    )
    .forEach((entry, i) => {
      add({ id: `experience:${String(i)}`, kind: 'experience', entry }, true);
    });
  draft.education
    .filter(
      (entry) =>
        !form.education.some(
          (e) => same(e.school, entry.school ?? '') && same(e.degree, entry.degree ?? ''),
        ),
    )
    .forEach((entry, i) => {
      add({ id: `education:${String(i)}`, kind: 'education', entry }, true);
    });
  return { suggestions, selected };
}

/** Seçilen önerileri forma uygular; formda olan hiçbir şeyi seçilmeden silmez. */
export function applySuggestions(
  form: ProfileForm,
  suggestions: Suggestion[],
  selected: ReadonlySet<string>,
): ProfileForm {
  const next: ProfileForm = { ...form };
  const skills = splitList(form.skills);
  const languages = splitList(form.languages);
  for (const s of suggestions) {
    if (!selected.has(s.id)) continue;
    switch (s.kind) {
      case 'field':
        next[s.field] = s.proposed;
        break;
      case 'skill':
        skills.push(s.value);
        break;
      case 'language':
        languages.push(s.value);
        break;
      case 'experience':
        next.experience = [...next.experience, experienceToForm(s.entry)];
        break;
      case 'education':
        next.education = [...next.education, educationToForm(s.entry)];
        break;
    }
  }
  next.skills = listText(skills);
  next.languages = listText(languages);
  return next;
}

/** Kaydedilmiş profille aynı mı? (React anahtarları karşılaştırmaya girmez.) */
export function sameForm(a: ProfileForm, b: ProfileForm): boolean {
  return JSON.stringify(fromForm(a)) === JSON.stringify(fromForm(b));
}
