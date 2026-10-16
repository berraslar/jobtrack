import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ApplicationStage } from '@jobtrack/shared';
import { LanguageSelect } from '../components/LanguageSelect';
import {
  Aurora,
  FollowUpBadge,
  HUE_FILL,
  HUE_SOLID,
  LINK,
  Monogram,
  PRIMARY_LINK,
  SECONDARY_LINK,
  SHEET,
  StageBadge,
  StageRuler,
  stageHue,
  stagger,
  Wordmark,
} from '../components/ui';
import { useI18n } from '../i18n';

// Oturumsuz ziyaretçinin ana sayfası. İllüstrasyon yerine uygulamanın kendisi: uydurma verili,
// kendi kendine işleyen küçük bir pano. Uydurma rakam, kullanıcı yorumu ya da logo yoktur
// (PRODUCT.md); örnek veri açıkça "uydurma" diye etiketlenir.

const SHELL = 'mx-auto w-full max-w-[76rem] px-4 sm:px-8 lg:px-12';

export function LandingPage() {
  const { t } = useI18n();
  const l = t.landing;

  useEffect(() => {
    const previous = document.title;
    document.title = l.pageTitle;
    return () => {
      document.title = previous;
    };
  }, [l.pageTitle]);

  return (
    <div className="min-h-screen overflow-x-clip text-ink">
      <Aurora />
      <header className="relative z-10">
        <div className={`${SHELL} flex min-h-20 flex-wrap items-center justify-between gap-3 py-4`}>
          <Wordmark />
          <nav aria-label={l.mainNav} className="flex flex-wrap items-center gap-2">
            <LanguageSelect />
            <Link to="/kayit" className={`${LINK} hidden px-2 text-sm font-semibold sm:inline`}>
              {l.register}
            </Link>
            <Link to="/giris" className={PRIMARY_LINK}>
              {l.login}
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative isolate">
          {/* Şeftaliden lilaya akan, alt kenarı geniş bir eğriyle biten ışık yüzeyi. */}
          <div
            aria-hidden
            className="absolute inset-x-0 -top-24 bottom-0 -z-10 rounded-b-[50%_7rem] bg-[linear-gradient(120deg,var(--color-glow-peach)_0%,var(--color-glow-lilac)_55%,var(--color-glow-sky)_100%)] opacity-90 sm:rounded-b-[60%_12rem]"
          />
          <div
            className={`${SHELL} grid items-center gap-12 pt-8 pb-24 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14 lg:pt-16 lg:pb-36`}
          >
            <div className="rise">
              <h1 className="mb-6 text-[2.75rem] leading-[0.98] font-extrabold tracking-[-0.04em] text-balance sm:text-[3.75rem] lg:text-[4.5rem]">
                {l.title}
              </h1>
              <p className="mb-9 max-w-[48ch] text-[1.125rem] leading-relaxed text-ink-muted">
                {l.lead}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/giris" className={`${PRIMARY_LINK} min-h-12 px-7 text-base`}>
                  {l.primary}
                  <ArrowIcon />
                </Link>
                <a href="#nasil-calisir" className={`${SECONDARY_LINK} min-h-12 px-7 text-base`}>
                  {l.secondary}
                </a>
              </div>
            </div>
            <LiveBoard />
          </div>
        </section>

        <Band id="nasil-calisir" title={l.stepsTitle}>
          <ol className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Adımları birbirine bağlayan kesikli yol (yalnızca geniş ekranda). */}
            <span
              aria-hidden
              className="absolute top-9 right-[12%] left-[12%] hidden border-t-2 border-dashed border-line-strong lg:block"
            />
            {l.steps.map((step, i) => {
              const hue = STEP_HUES[i % STEP_HUES.length] ?? 'lilac';
              return (
                <li
                  key={step.title}
                  className="reveal relative flex flex-col items-center px-3 text-center"
                >
                  <span
                    className={`relative mb-5 grid size-[4.5rem] place-items-center rounded-full ring-8 ring-canvas ${HUE_FILL[hue]}`}
                  >
                    <StepIcon index={i} />
                  </span>
                  <h3 className="mb-1.5 text-xl font-bold">{step.title}</h3>
                  <p className="max-w-[28ch] text-sm leading-relaxed text-ink-muted">{step.text}</p>
                </li>
              );
            })}
          </ol>
        </Band>

        <Band title={l.featuresTitle}>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {l.features.map((feature, i) => {
              const hue = FEATURE_HUES[i % FEATURE_HUES.length] ?? 'lilac';
              const lead = i === 0;
              return (
                <li
                  key={feature.title}
                  className={`reveal group relative overflow-hidden rounded-xl p-6 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] sm:p-7 ${HUE_FILL[hue]} ${lead ? 'sm:col-span-2 lg:row-span-3' : ''}`}
                >
                  <span
                    aria-hidden
                    className={`absolute -right-12 -bottom-12 size-32 rounded-full opacity-25 transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-125 ${HUE_SOLID[hue]}`}
                  />
                  <h3
                    className={`relative mb-2 font-bold ${lead ? 'text-2xl sm:text-3xl' : 'text-xl'}`}
                  >
                    {feature.title}
                  </h3>
                  <p className="relative max-w-[44ch] text-sm leading-relaxed text-ink-muted">
                    {feature.text}
                  </p>
                  {lead && <StagePathDemo />}
                </li>
              );
            })}
          </ul>
        </Band>

        <section aria-labelledby="gizlilik" className={`${SHELL} pt-24`}>
          <div
            className={`${SHEET} reveal grid gap-10 p-7 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16 lg:p-14`}
          >
            <div>
              <span
                aria-hidden
                className="mb-6 grid size-14 place-items-center rounded-lg bg-mint text-mint-solid"
              >
                <ShieldIcon />
              </span>
              <h2
                id="gizlilik"
                className="mb-3 text-[2rem] leading-tight font-bold tracking-[-0.035em]"
              >
                {l.privacyTitle}
              </h2>
              <p className="max-w-[44ch] text-ink-muted">{l.privacyLead}</p>
            </div>
            <ul className="flex flex-col gap-3">
              {l.privacy.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 rounded-lg bg-surface-muted px-4 py-3.5 text-[0.9375rem]"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-mint-solid text-surface"
                  >
                    <CheckIcon />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="relative isolate mt-24 overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 rounded-t-[50%_7rem] bg-[linear-gradient(100deg,var(--color-glow-sky),var(--color-glow-lilac)_50%,var(--color-glow-peach))] sm:rounded-t-[60%_12rem]"
          />
          <div className={`${SHELL} flex flex-wrap items-end justify-between gap-8 pt-28 pb-20`}>
            <div className="reveal">
              <h2 className="mb-3 text-[2.5rem] leading-none font-extrabold tracking-[-0.04em] sm:text-[3.25rem]">
                {l.closingTitle}
              </h2>
              <p className="text-lg text-ink-muted">{l.closingText}</p>
            </div>
            <Link to="/giris" className={`${PRIMARY_LINK} min-h-12 px-7 text-base`}>
              {l.primary}
              <ArrowIcon />
            </Link>
          </div>
          <footer className="border-t border-ink/10">
            <div
              className={`${SHELL} flex flex-wrap items-center justify-between gap-3 py-6 text-sm text-ink-muted`}
            >
              <Wordmark className="text-base" />
              <p>{l.footer}</p>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}

const STEP_HUES = ['sky', 'lilac', 'peach', 'mint'] as const;
// Yedi kart: büyük kart (2 × 3) + sağ sütunda üç + alt satırda üç; komşu kartlar aynı renkte olmaz.
const FEATURE_HUES = ['lilac', 'peach', 'sky', 'mint', 'butter', 'sky', 'peach'] as const;

function Band({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section id={id} aria-labelledby={headingId} className={`${SHELL} scroll-mt-6 pt-24`}>
      <h2
        id={headingId}
        className="reveal mb-12 text-center text-[2.25rem] leading-tight font-extrabold tracking-[-0.04em] sm:text-[2.75rem]"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

// Canlı pano: bir örnek başvuru kendi kendine aşamalar arasında ilerler. Sekme gizliyken ya da
// azaltılmış hareket tercihinde durur.
const JOURNEY: ApplicationStage[] = ['applied', 'technical', 'offer'];
const BOARD_COLUMNS: ApplicationStage[] = ['applied', 'technical', 'offer'];

function useJourneyStep(): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setStep((s) => (s + 1) % JOURNEY.length);
    }, 2800);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return step;
}

function LiveBoard() {
  const { t, labels } = useI18n();
  const s = t.landing.specimen;
  const step = useJourneyStep();
  const [lead, moving, offer, rejected] = s.rows;
  if (!lead || !moving || !offer || !rejected) return null;
  const movingStage = JOURNEY[step] ?? 'applied';
  // Sabit kartlar: her sütunda bir tane; hareket eden kart aşamasına göre sütun değiştirir.
  const fixed: Record<string, { company: string; position: string; stage: ApplicationStage }[]> = {
    applied: [{ ...rejected, stage: 'applied' }],
    technical: [lead],
    offer: [offer],
  };

  return (
    <figure className="relative">
      {/* Yüzen şekiller: panonun çevresinde, havada; azaltılmış harekette durur. */}
      <Blob
        shape={0}
        className="float absolute -top-14 right-[22%] z-10 hidden size-16 text-peach-solid sm:block sm:size-20"
      />
      <Blob
        shape={1}
        className="float absolute -top-8 left-[8%] z-10 hidden size-10 text-butter-solid [animation-delay:-2s] sm:block"
      />
      <Blob
        shape={2}
        className="float absolute -right-8 bottom-[18%] z-10 hidden size-12 text-lilac-solid [animation-delay:-4s] lg:block"
      />
      <Blob
        shape={3}
        className="float absolute right-[44%] -bottom-4 z-10 hidden size-11 text-sky-solid [animation-delay:-5s] sm:block"
      />
      <Blob
        shape={1}
        className="float absolute top-[58%] -left-6 z-10 hidden size-8 text-mint-solid [animation-delay:-6s] lg:block"
      />
      {/* Dar ekranda tek bir şekil, panonun alt köşesinde, düğmelerden uzakta. */}
      <Blob
        shape={0}
        className="float absolute right-6 bottom-12 z-10 size-10 text-peach-solid sm:hidden"
      />
      <div
        className={`${SHEET} rise relative rotate-[-1.2deg] p-3 shadow-lift sm:p-4`}
        style={stagger(2)}
        aria-hidden
      >
        <div className="mb-3 flex items-center gap-1.5 px-1">
          <span className="size-2.5 rounded-full bg-rose-solid/70" />
          <span className="size-2.5 rounded-full bg-butter-solid/80" />
          <span className="size-2.5 rounded-full bg-mint-solid/70" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {BOARD_COLUMNS.map((column) => {
            const hue = stageHue(column);
            const cards = [
              ...(fixed[column] ?? []),
              ...(movingStage === column ? [{ ...moving, stage: movingStage }] : []),
            ];
            return (
              <div
                key={column}
                className="flex min-w-0 flex-col gap-2 rounded-lg bg-surface-muted p-1.5"
              >
                <p
                  className={`flex items-center gap-1.5 truncate rounded-md px-2 py-1.5 text-[0.6875rem] font-bold sm:text-xs ${HUE_FILL[hue]}`}
                >
                  <span className={`size-2 shrink-0 rounded-full ${HUE_SOLID[hue]}`} />
                  <span className="truncate">{labels.stages[column]}</span>
                </p>
                {cards.map((card) => {
                  const isMoving = card.company === moving.company;
                  return (
                    <div
                      key={`${card.company}-${isMoving ? String(step) : 'fixed'}`}
                      className={`land rounded-md bg-surface p-2 shadow-soft ring-1 sm:p-2.5 ${isMoving ? 'ring-2 ring-focus/50' : 'ring-line'}`}
                    >
                      <div className="mb-1.5 flex min-w-0 items-center gap-1.5">
                        <Monogram
                          name={card.company}
                          className="!size-6 !rounded-sm !text-[0.6875rem]"
                        />
                        <span className="truncate text-[0.6875rem] font-bold sm:text-xs">
                          {card.company}
                        </span>
                      </div>
                      <p className="mb-2 truncate text-[0.6875rem] text-ink-muted">
                        {card.position}
                      </p>
                      <StageRuler stage={card.stage} className="!w-full" />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {/* Öne çıkan kart: hareket eden başvurunun büyütülmüş hali. */}
      <div
        className={`${SHEET} float absolute -bottom-14 -left-2 hidden w-64 p-4 shadow-lift sm:block lg:-left-10`}
        aria-hidden
      >
        <div className="mb-2 flex items-center gap-2">
          <Monogram name={moving.company} className="!size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{moving.position}</p>
            <p className="truncate text-xs text-ink-muted">{moving.company}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <StageBadge stage={movingStage} />
          <StageRuler stage={movingStage} className="!w-full" />
          {movingStage === 'applied' && <FollowUpBadge />}
        </div>
      </div>
      <figcaption className="mt-20 text-center text-xs font-medium text-ink-muted sm:mt-6 sm:text-right">
        {s.caption}
      </figcaption>
    </figure>
  );
}

// Dört yumuşak, düzensiz leke silueti (elle çizildi; 64 birimlik kare).
const BLOBS = [
  'M33 4c11 0 24 7 27 19 3 13-4 25-14 32-10 6-24 7-34 0C3 49 1 36 5 25 9 13 21 4 33 4z',
  'M32 6c8-3 19 1 24 9 5 7 3 15 0 22-3 9-8 18-18 21-10 3-22-1-29-9-6-8-5-18-1-26 5-9 15-14 24-17z',
  'M14 12c8-8 22-9 32-3 10 5 15 17 12 28-2 10-11 19-22 21-11 2-23-2-29-11-6-10-1-27 7-35z',
  'M30 3c6 4 7 12 13 15 7 3 16 2 18 9 2 8-4 15-9 21-6 8-14 14-24 13C18 60 9 53 5 44 1 35 4 24 10 16c5-7 13-17 20-13z',
];

function Blob({ shape, className = '' }: { shape: number; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 64 64" className={className}>
      <path d={BLOBS[shape % BLOBS.length]} fill="currentColor" opacity="0.85" />
    </svg>
  );
}

/** Özellik kartındaki küçük gösterim: aynı başvurunun aşama yolunda ilerleyişi. */
function StagePathDemo() {
  const stages: ApplicationStage[] = ['saved', 'applied', 'technical', 'final', 'offer'];
  return (
    <div aria-hidden className="relative mt-8 flex flex-col gap-3 rounded-lg bg-surface/80 p-4">
      {stages.map((stage, i) => (
        <div
          key={stage}
          className="reveal flex items-center justify-between gap-4"
          style={stagger(i)}
        >
          <StageBadge stage={stage} />
          <StageRuler stage={stage} />
        </div>
      ))}
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4"
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

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 12 12"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6.2l2.3 2.3 4.7-4.9" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

const STEP_ICONS = [
  // Kaydedin: artı
  'M12 5v14M5 12h14',
  // Uyarlayın: tek sayfalık belge
  'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h4',
  // İlerletin: ileri ok
  'M5 12h14M13 6l6 6-6 6',
  // Takip edin: zil
  'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
];

function StepIcon({ index }: { index: number }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-7 text-ink"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={STEP_ICONS[index % STEP_ICONS.length]} />
    </svg>
  );
}
