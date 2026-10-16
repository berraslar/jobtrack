import { useState, type ReactNode } from 'react';
import { ArrowIcon, FOCUS_RING, HUE_FILL, stagger } from '../../components/ui';
import { useI18n } from '../../i18n';

// Küçük, bağımlılıksız grafik bileşenleri (dataviz kuralları): ince işaretler (≤24 px), uca 4 px
// yuvarlak ve tabanda düz kenar, silik ızgara, değerler metin renginde, her işarette üzerine
// gelince/odaklanınca ipucu ve her grafiğin bir tablo görünümü.

export function StatTile({
  label,
  value,
  detail,
  hue = 'lilac',
  index = 0,
  arrow = false,
}: {
  label: string;
  value: string;
  detail?: string;
  hue?: keyof typeof HUE_FILL;
  index?: number;
  /** Ayrıntı satırı bir bağlantıyı anlatıyorsa sağa ok. */
  arrow?: boolean;
}) {
  return (
    <div
      className={`rise relative h-full overflow-hidden rounded-xl px-5 pt-4 pb-5 ${HUE_FILL[hue]}`}
      style={stagger(index)}
    >
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      {/* İri rakam: sayı başlıktan belirgin biçimde büyük (büyük-küçük karşıtlığı). */}
      <p className="mt-3 font-display text-[3rem] leading-[0.95] font-bold tracking-[-0.04em] tabular-nums">
        {value}
      </p>
      {detail && (
        <p className="mt-2 flex items-center gap-1 text-xs text-ink-muted">
          {detail}
          {arrow && (
            <ArrowIcon className="size-3 transition-transform duration-300 group-hover:translate-x-0.5" />
          )}
        </p>
      )}
    </div>
  );
}

/** Çubuğun üstünde, odak veya fareyle görünen ipucu. Ekran okuyucu için değer aria-label'dadır. */
function Tip({
  show,
  side = 'top',
  children,
}: {
  show: boolean;
  side?: 'top' | 'end';
  children: ReactNode;
}) {
  if (!show) return null;
  // Yatay çubukta ipucu satırın sağ ucuna oturur; üstteki satırın çubuğunu örtmez.
  const position =
    side === 'end'
      ? 'top-1/2 right-0 -translate-y-1/2'
      : 'bottom-full left-1/2 mb-1.5 -translate-x-1/2';
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-10 rounded-sm bg-ink px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-surface shadow-lift ${position}`}
    >
      {children}
    </span>
  );
}

/** Yatay çubuklar: kategori başına bir değer (aşama dağılımı). Değer çubuğun ucunda. */
export function BarList({
  items,
  unit,
}: {
  items: { key: string; label: string; value: number }[];
  unit: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, index) => (
        <li
          key={item.key}
          tabIndex={0}
          aria-label={`${item.label}: ${String(item.value)} ${unit}`}
          onMouseEnter={() => {
            setActive(item.key);
          }}
          onMouseLeave={() => {
            setActive(null);
          }}
          onFocus={() => {
            setActive(item.key);
          }}
          onBlur={() => {
            setActive(null);
          }}
          className={`grid grid-cols-[7.5rem_1fr] items-center gap-3 rounded-sm px-1 py-1 text-sm transition-colors hover:bg-surface-muted sm:grid-cols-[9rem_1fr] ${FOCUS_RING}`}
        >
          <span className="truncate text-ink-muted">{item.label}</span>
          <span className="relative flex items-center gap-2">
            <span
              aria-hidden
              className="grow-x block h-4 rounded-r-[4px] bg-series-1"
              style={{
                width: `${String((item.value / max) * 85)}%`,
                minWidth: item.value > 0 ? 4 : 0,
                ...stagger(index),
              }}
            />
            <span aria-hidden className="font-semibold tabular-nums text-ink">
              {item.value}
            </span>
            <Tip show={active === item.key} side="end">
              {item.label}: {item.value} {unit}
            </Tip>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Dikey sütunlar: zaman içinde sayı (haftalık başvuru). Taban çizgisi ve en yüksek değer etiketi. */
export function ColumnChart({
  items,
  unit,
  caption,
}: {
  items: { key: string; label: string; shortLabel: string; value: number }[];
  unit: string;
  caption: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...items.map((i) => i.value));
  // En yüksek değer, tek doğrudan etiket alır (her sütuna sayı yazılmaz).
  const peak = items.reduce<(typeof items)[number] | undefined>(
    (best, item) => (best === undefined || item.value > best.value ? item : best),
    undefined,
  );
  return (
    <figure>
      <div className="relative h-40 border-b border-grid">
        {/* Silik yarım-değer çizgisi */}
        <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-grid" />
        <ul className="absolute inset-0 flex items-end gap-0.5">
          {items.map((item, index) => {
            const height = (item.value / max) * 100;
            return (
              <li
                key={item.key}
                tabIndex={0}
                aria-label={`${item.label}: ${String(item.value)} ${unit}`}
                onMouseEnter={() => {
                  setActive(item.key);
                }}
                onMouseLeave={() => {
                  setActive(null);
                }}
                onFocus={() => {
                  setActive(item.key);
                }}
                onBlur={() => {
                  setActive(null);
                }}
                className={`relative flex h-full flex-1 items-end justify-center ${FOCUS_RING}`}
              >
                <span
                  aria-hidden
                  className="grow-y block w-full max-w-6 rounded-t-[4px] bg-series-1"
                  style={{
                    height: `${String(height)}%`,
                    minHeight: item.value > 0 ? 4 : 0,
                    ...stagger(index),
                  }}
                />
                {peak && item.key === peak.key && item.value > 0 && active !== item.key && (
                  <span
                    aria-hidden
                    className="absolute text-xs font-semibold tabular-nums text-ink"
                    style={{ bottom: `calc(${String(height)}% + 2px)` }}
                  >
                    {item.value}
                  </span>
                )}
                <Tip show={active === item.key}>
                  {item.label}: {item.value} {unit}
                </Tip>
              </li>
            );
          })}
        </ul>
      </div>
      <div aria-hidden className="mt-1 flex gap-0.5 text-xs text-ink-muted">
        {items.map((item, index) => (
          // Etiket sütunun ortasına hizalanır, sarmaz; taşarsa iki yana eşit taşar.
          <span key={item.key} className="flex min-w-0 flex-1 justify-center whitespace-nowrap">
            {index % 2 === 0 ? item.shortLabel : ''}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}

/** Oran hücresi: yüzde metni ve 0–100 arası ince bir çubuk. Payda 0 ise "—". */
export function RateCell({ value }: { value: number | null }) {
  const { formatPercent } = useI18n();
  if (value === null) return <span className="text-ink-muted">{formatPercent(null)}</span>;
  const percent = Math.round(value * 100);
  return (
    <span className="flex items-center gap-2">
      <span className="w-10 text-right tabular-nums">{formatPercent(value)}</span>
      <span aria-hidden className="hidden h-2 w-20 overflow-hidden rounded-full bg-grid md:block">
        <span
          className="grow-x block h-2 rounded-full bg-series-1"
          style={{ width: `${String(percent)}%`, minWidth: percent > 0 ? 4 : 0 }}
        />
      </span>
    </span>
  );
}

/** Grafiğin verisini tablo olarak açan bölüm (renk/şekle dayanmayan alternatif). */
export function DataTable({
  summary,
  columns,
  rows,
}: {
  summary: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="group mt-3 text-sm">
      <summary
        className={`flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-xs font-medium text-ink-muted underline decoration-lilac-solid/50 underline-offset-4 hover:text-ink [&::-webkit-details-marker]:hidden ${FOCUS_RING}`}
      >
        <svg
          aria-hidden
          viewBox="0 0 8 8"
          className="size-2 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-open:rotate-90"
          fill="currentColor"
        >
          <path d="M2 0l4 4-4 4z" />
        </svg>
        {summary}
      </summary>
      <table className="mt-2 w-full text-left">
        <thead className="text-xs text-ink-muted">
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col" className="py-1 pr-4 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, i) => (
                <td key={i} className="py-1 pr-4 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
