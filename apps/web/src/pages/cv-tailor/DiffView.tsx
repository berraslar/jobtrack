import { useId, useMemo } from 'react';
import { useI18n } from '../../i18n';
import { changedRowCount, diffLines, type Segment } from '../../lib/diff';

// FR-24: Ana CV (solda) ve uyarlanmış CV (sağda) yan yana. Değişiklik yalnızca renkle değil,
// üstü çizili / altı çizili metinle ve ekran okuyucu için "çıkarıldı / eklendi" etiketiyle gösterilir.

function Segments({ segments, side }: { segments: Segment[]; side: 'left' | 'right' }) {
  const { t } = useI18n();
  const r = t.cvTailor.result;
  return (
    <>
      {segments.map((segment, i) =>
        !segment.changed ? (
          <span key={i}>{segment.text}</span>
        ) : side === 'left' ? (
          <del key={i} className="rounded-sm bg-rose decoration-rose-solid">
            <span className="sr-only">{r.removed}: </span>
            {segment.text}
          </del>
        ) : (
          <ins key={i} className="rounded-sm bg-mint no-underline decoration-mint-solid">
            <span className="sr-only">{r.added}: </span>
            <span className="underline decoration-2 underline-offset-2">{segment.text}</span>
          </ins>
        ),
      )}
    </>
  );
}

const CELL = 'min-h-6 px-3 py-0.5 whitespace-pre-wrap break-words';

export function DiffView({ left, right }: { left: string; right: string }) {
  const { t } = useI18n();
  const r = t.cvTailor.result;
  const rows = useMemo(() => diffLines(left, right), [left, right]);
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={headingId} className="text-base font-semibold">
          {r.diff}
        </h3>
        <p role="status" className="text-xs font-semibold text-ink-muted">
          {r.diffSummary(changedRowCount(rows))}
        </p>
      </div>
      <div className="max-h-[32rem] overflow-auto rounded-lg ring-1 ring-line">
        <div className="sticky top-0 z-10 grid grid-cols-2 bg-surface-muted text-xs font-bold text-ink-muted">
          <span className="px-3 py-2">{r.original}</span>
          <span className="border-l border-line px-3 py-2">{r.tailored}</span>
        </div>
        <div className="grid grid-cols-2 font-mono text-[0.8125rem] leading-relaxed">
          {rows.map((row, i) => {
            const leftTone =
              row.kind === 'removed' ? 'bg-rose/60' : row.kind === 'changed' ? 'bg-rose/25' : '';
            const rightTone =
              row.kind === 'added' ? 'bg-mint/60' : row.kind === 'changed' ? 'bg-mint/25' : '';
            return (
              <div key={i} className="contents">
                <div className={`${CELL} ${leftTone}`}>
                  {row.kind === 'same' && row.left}
                  {row.kind === 'removed' && (
                    <Segments segments={[{ text: row.left, changed: true }]} side="left" />
                  )}
                  {row.kind === 'changed' && <Segments segments={row.left} side="left" />}
                </div>
                <div className={`${CELL} border-l border-line ${rightTone}`}>
                  {row.kind === 'same' && row.right}
                  {row.kind === 'added' && (
                    <Segments segments={[{ text: row.right, changed: true }]} side="right" />
                  )}
                  {row.kind === 'changed' && <Segments segments={row.right} side="right" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
