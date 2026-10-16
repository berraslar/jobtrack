import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { APPLICATION_STAGES, CLOSED_STAGES, type ApplicationStage } from '@jobtrack/shared';
import { useI18n } from '../i18n';

// Pastel atölyenin temel bileşenleri (DESIGN.md). Yumuşak köşeli beyaz yapraklar, hap biçimli
// düğmeler ve her aşamanın sabit pastel tonu. Tıklanabilir hedefler en az 24×24 px (WCAG 2.5.8);
// burada 40 px yükseklik kullanılır.

export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

/** Basınca hafifçe çöken, üzerine gelince yükselen hap düğme hareketi. */
const PRESS =
  'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.97]';

const BUTTON_STYLES = new Map([
  ['primary', 'bg-brand text-on-brand shadow-soft hover:bg-brand-strong hover:shadow-lift'],
  [
    'secondary',
    'border border-line-strong bg-surface text-ink hover:border-ink/40 hover:bg-surface-muted',
  ],
  ['danger', 'bg-danger text-surface hover:opacity-90'],
  // Sayfa içindeki yıkıcı eylem: sakin çizgili; dolu kırmızı yalnızca son onay adımında.
  [
    'danger-quiet',
    'border border-danger/40 bg-surface text-danger hover:border-danger hover:bg-rose',
  ],
  ['ghost', 'text-ink-muted hover:bg-surface-muted hover:text-ink'],
] as const);

const ALERT_STYLES = new Map([
  ['error', 'border-danger/30 bg-danger/8 text-danger'],
  ['warning', 'border-butter-solid/40 bg-butter text-ink'],
  ['success', 'border-mint-solid/40 bg-mint text-ink'],
] as const);

const CONTROL =
  'min-h-10 w-full rounded-sm border border-control/70 bg-surface px-3 text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-ink-muted hover:border-ink/60 focus-visible:border-focus focus-visible:shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)] focus-visible:outline-none aria-invalid:border-danger disabled:opacity-60';

/** Metin bağlantısı: altı çizili, üzerine gelince lila. */
export const LINK = `rounded-xs text-ink underline decoration-lilac-solid/50 underline-offset-4 transition-colors hover:decoration-lilac-solid ${FOCUS_RING}`;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'danger-quiet' | 'ghost';
}) {
  const styles = BUTTON_STYLES.get(variant);
  return (
    <button
      type="button"
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold whitespace-nowrap ${PRESS} ${FOCUS_RING} disabled:pointer-events-none disabled:opacity-50 ${styles ?? ''} ${className}`}
      {...props}
    />
  );
}

/** Etiket, ipucu ve hata metnini kontrolle ilişkilendirir (aria-describedby). */
function FieldShell({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: (props: {
    id: string;
    'aria-invalid'?: true;
    'aria-describedby'?: string;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-semibold text-ink">
        {label}
      </label>
      {children({
        id,
        ...(error ? { 'aria-invalid': true as const } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      })}
      {hint && (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type FieldExtras = { label: string; hint?: string | undefined; error?: string | undefined };

export function Field({
  label,
  hint,
  error,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & FieldExtras) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(a11y) => <input className={CONTROL} {...a11y} {...input} />}
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...select
}: SelectHTMLAttributes<HTMLSelectElement> & FieldExtras) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(a11y) => (
        <select className={`${CONTROL} pr-8`} {...a11y} {...select}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  ...textarea
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldExtras) {
  return (
    <FieldShell label={label} hint={hint} error={error}>
      {(a11y) => <textarea className={`${CONTROL} py-2`} rows={4} {...a11y} {...textarea} />}
    </FieldShell>
  );
}

export function Alert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'warning' | 'success';
  children: ReactNode;
}) {
  const styles = ALERT_STYLES.get(tone);
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rise rounded-md border px-4 py-3 text-sm ${styles ?? ''}`}
    >
      {children}
    </div>
  );
}

/** Beyaz yaprak: yuvarlak köşeli, yumuşak gölgeli bölüm. */
export const SHEET = 'rounded-xl bg-surface shadow-sheet ring-1 ring-line/70';

/**
 * Bölüm yaprağı: başlık solda, eylemler aynı satırda sağda. Yaprakların içine yaprak konmaz.
 */
export function Card({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={`${SHEET} min-w-0 p-5 sm:p-7`}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold text-ink">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Aşama aileleri: her aşamanın sabit pastel tonu (rozet, Kanban sütunu, yol, grafik). */
type Hue = 'sky' | 'lilac' | 'peach' | 'butter' | 'mint' | 'rose' | 'mist';

const STAGE_HUE: Record<ApplicationStage, Hue> = {
  saved: 'sky',
  applied: 'lilac',
  screening: 'lilac',
  technical: 'peach',
  assignment: 'peach',
  final: 'butter',
  offer: 'mint',
  accepted: 'mint',
  rejected: 'rose',
  no_response: 'mist',
  withdrawn: 'mist',
};

// Tailwind sınıfları derleme anında taranır; bu yüzden tam sınıf adları burada yazılıdır.
export const HUE_FILL: Record<Hue, string> = {
  sky: 'bg-sky',
  lilac: 'bg-lilac',
  peach: 'bg-peach',
  butter: 'bg-butter',
  mint: 'bg-mint',
  rose: 'bg-rose',
  mist: 'bg-mist',
};

export const HUE_SOLID: Record<Hue, string> = {
  sky: 'bg-sky-solid',
  lilac: 'bg-lilac-solid',
  peach: 'bg-peach-solid',
  butter: 'bg-butter-solid',
  mint: 'bg-mint-solid',
  rose: 'bg-rose-solid',
  mist: 'bg-mist-solid',
};

export const stageHue = (stage: ApplicationStage): Hue => STAGE_HUE[stage];

/** Aşamanın pastel rozeti; renk her zaman aşama adıyla birlikte. */
export function StageBadge({ stage }: { stage: ApplicationStage }) {
  const { labels } = useI18n();
  const hue = STAGE_HUE[stage];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-[0.8125rem] font-semibold whitespace-nowrap text-ink ${HUE_FILL[hue]}`}
    >
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${HUE_SOLID[hue]}`} />
      {labels.stages[stage]}
    </span>
  );
}

const OPEN_STAGE_COUNT = APPLICATION_STAGES.length - CLOSED_STAGES.length;

/**
 * İmza öğe: aşama yolu. Yuvarlak bir patika, süren başvuruda açık aşamalar boyunca aşamanın
 * tonuyla dolar; sonuçlanmış başvuruda tamamen dolar. Aşama değişince dolgu uzar ve işaret
 * yeni yerine süzülür. Bilgi yanındaki rozetle verildiği için ekran okuyuculardan gizlenir.
 */
export function StageRuler({
  stage,
  className = '',
}: {
  stage: ApplicationStage;
  className?: string;
}) {
  const index = APPLICATION_STAGES.indexOf(stage);
  const open = index < OPEN_STAGE_COUNT;
  const progress = open ? (index + 1) / OPEN_STAGE_COUNT : 1;
  const hue = STAGE_HUE[stage];
  const motion = 'duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)]';
  return (
    <span aria-hidden className={`relative block h-2 w-[7.5rem] shrink-0 ${className}`}>
      <span className="absolute inset-0 rounded-full bg-grid" />
      {/* Açık aşamaların sınırları: yolun üzerinde ince durak çentikleri. */}
      <span className="absolute inset-0 flex justify-between px-[3px]">
        {Array.from({ length: OPEN_STAGE_COUNT - 1 }, (_, i) => (
          <span key={i} className="my-auto size-[3px] rounded-full bg-ink/10 first:invisible" />
        ))}
      </span>
      <span
        className={`absolute inset-y-0 left-0 w-full origin-left rounded-full transition-[transform,background-color] ${motion} ${HUE_SOLID[hue]}`}
        style={{ transform: `scaleX(${String(progress)})` }}
      />
      {/* İşaret, yol genişliği kadar kayan bir katmanın sol ucunda durur: yalnızca transform. */}
      <span
        className={`absolute inset-0 transition-transform ${motion}`}
        style={{ transform: `translateX(${String(progress * 100)}%)` }}
      >
        <span
          className={`absolute top-1/2 -left-[0.4375rem] size-3.5 -translate-y-1/2 rounded-full border-[3px] border-surface shadow-soft transition-colors ${motion} ${HUE_SOLID[hue]}`}
        />
      </span>
    </span>
  );
}

export function FollowUpBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-signal/10 py-0.5 pr-2.5 pl-2 text-xs font-bold whitespace-nowrap text-signal">
      <span aria-hidden className="relative flex size-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-signal/50 [animation-duration:2.4s] [animation-iteration-count:3]" />
        <span className="relative size-2 rounded-full bg-signal" />
      </span>
      {t.common.followUp}
    </span>
  );
}

/**
 * Onay penceresi (FR-15: silme onay ister). Yerel <dialog> öğesi odak tuzağını, Esc ile kapanmayı
 * ve arka planın etkisizleşmesini tarayıcıya bırakır.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-surface p-7 text-ink shadow-lift transition-[opacity,transform,overlay,display] transition-discrete duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] backdrop:bg-ink/30 backdrop:backdrop-blur-[2px] open:scale-100 starting:open:scale-95 starting:open:translate-y-2"
    >
      <h2 id={titleId} className="mb-2 text-xl font-semibold">
        {title}
      </h2>
      <div className="mb-7 text-sm text-ink-muted">{description}</div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} autoFocus>
          {t.common.cancel}
        </Button>
        <Button variant="danger" onClick={onConfirm} disabled={pending}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

/** Sayfa başlığı: iri başlık, yanında isteğe bağlı kayıt sayısı hapı. */
export function PageHeader({
  title,
  count,
  actions,
}: {
  title: string;
  count?: number | undefined;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-1 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-[2.125rem] leading-none font-bold tracking-[-0.035em] sm:text-[2.625rem]">
          {title}
        </h1>
        {count !== undefined && (
          <span className="rounded-full bg-lilac px-2.5 py-0.5 text-sm font-bold text-ink">
            {count}
          </span>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rise flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center text-sm text-ink-muted">
      <BlobMark className="size-12 opacity-80" />
      <p className="max-w-[44ch]">{children}</p>
    </div>
  );
}

/** Üç örtüşen ışık lekesi: şeftali, lila, gök. Adın yanındaki işaret. */
export function BlobMark({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`shrink-0 ${className}`}>
      <circle cx="12" cy="13" r="9" className="fill-peach-solid" />
      <circle cx="20" cy="12" r="8" className="fill-lilac-solid opacity-85" />
      <circle cx="16" cy="20" r="8" className="fill-sky-solid opacity-85" />
    </svg>
  );
}

/** Ad ve işaret; ekran görüntülerinde kimliği taşıyan öğe. */
export function Wordmark({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center gap-2 font-display text-[1.375rem] leading-none font-extrabold tracking-[-0.03em] text-ink ${className}`}
    >
      <BlobMark className="size-7" />
      {t.common.appName}
    </span>
  );
}

/** Zemin ışıkları: sabit, dekoratif katman (index.css .aurora). */
export function Aurora() {
  return (
    <div aria-hidden className="aurora">
      <span />
      <span />
      <span />
    </div>
  );
}

/** Sıralı yükselme için gecikme sırası (index.css .rise, --i). */
export const stagger = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

/** Birincil eylem görünümünde bağlantı (örn. "Yeni başvuru"). */
export const PRIMARY_LINK = `inline-flex min-h-10 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-on-brand shadow-soft ${PRESS} hover:bg-brand-strong hover:shadow-lift ${FOCUS_RING}`;

/** İkincil eylem görünümünde bağlantı. */
export const SECONDARY_LINK = `inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink ${PRESS} hover:border-ink/40 hover:bg-surface-muted ${FOCUS_RING}`;

const MONOGRAM_HUES = ['peach', 'lilac', 'sky', 'mint', 'butter', 'rose'] as const;

/** Şirket adının baş harfi, adın kendisinden türetilen sabit bir pastel zeminde. */
export function Monogram({
  name,
  large = false,
  className = '',
}: {
  name: string;
  large?: boolean;
  className?: string;
}) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  const hue = MONOGRAM_HUES[hash % MONOGRAM_HUES.length] ?? 'lilac';
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-md font-sans font-extrabold text-ink ${large ? 'size-14 text-2xl' : 'size-10 text-base'} ${HUE_FILL[hue]} ${className}`}
    >
      {name.trim().normalize('NFC').charAt(0).toLocaleUpperCase('tr')}
    </span>
  );
}

/** Yön oku (ikon); metindeki ← ve → karakterlerinin yerine. */
export function ArrowIcon({
  direction = 'right',
  className = '',
}: {
  direction?: 'left' | 'right';
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={`size-3.5 shrink-0 ${direction === 'left' ? 'rotate-180' : ''} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

/** Üst sayfaya dönüş bağlantısı: sola ok ve metin. */
export const BACK_LINK = `inline-flex w-fit items-center gap-1.5 rounded-xs text-sm font-medium text-ink-muted transition-colors hover:text-ink ${FOCUS_RING}`;
