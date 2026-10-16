import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react';
import { MASTER_CV_MAX } from '@jobtrack/shared';
import { TextAreaField } from '../../components/ui';
import { useI18n } from '../../i18n';
import { Markdown } from '../../lib/markdown';
import { fitToOnePage, type PageFit } from '../../lib/one-page';

const scaleStyle = (scale: number) => ({ '--cv-scale': String(scale) }) as CSSProperties;

/**
 * FR-23, FR-24: CV'yi ekran dışında, PDF ile aynı biçim ve genişlikte ölçer (lib/one-page.ts).
 * Yazı tipleri sonradan yüklenirse yeniden ölçer.
 */
function useOnePageFit(source: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<PageFit>({ scale: 1, pages: 1, fits: true });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let alive = true;
    const measure = () => {
      const next = fitToOnePage(element);
      setFit((prev) =>
        prev.scale === next.scale && prev.pages === next.pages && prev.fits === next.fits
          ? prev
          : next,
      );
    };
    measure();
    // Test ortamında (happy-dom) document.fonts olmayabilir.
    const fonts = (document as { fonts?: FontFaceSet }).fonts;
    void fonts?.ready.then(() => {
      if (alive) measure();
    });
    return () => {
      alive = false;
    };
  }, [source]);
  const measurer = (
    <div ref={ref} aria-hidden className="cv-print cv-measure">
      <Markdown source={source} />
    </div>
  );
  return { fit, measurer };
}

/** Tek sayfa durumu: sığıyor, küçültülerek sığıyor ya da aşıyor. */
function PageFitNote({ fit }: { fit: PageFit }) {
  const { t } = useI18n();
  const p = t.cvTailor.preview;
  if (!fit.fits) {
    return <p className="mt-2 text-xs font-semibold text-signal">{p.over(fit.pages)}</p>;
  }
  return (
    <p className="mt-2 text-xs text-ink-muted">
      {fit.scale < 1 ? p.shrunk(Math.round(fit.scale * 100)) : p.fits}
    </p>
  );
}

/**
 * FR-23, FR-24: CV'nin yazdırma (PDF) görünümü. Ekranda ve PDF'te aynı .cv-print biçimi
 * kullanılır; koyu temada da kâğıt beyaz kalır, çünkü çıktının kendisini gösterir. Altında
 * tek sayfaya sığıp sığmadığı yazar; PDF'te uygulanacak küçültme önizlemede de uygulanır.
 */
export function CvPreview({ source, label }: { source: string; label?: string }) {
  const { t } = useI18n();
  const { fit, measurer } = useOnePageFit(source);
  const empty = source.trim() === '';
  return (
    <div>
      <section
        aria-label={label ?? t.cvTailor.preview.label}
        className="max-h-[42rem] overflow-auto rounded-md bg-white px-7 py-6 ring-1 ring-line"
      >
        {empty ? (
          <p className="text-sm text-[#555555]">{t.cvTailor.preview.empty}</p>
        ) : (
          <div className="cv-print" style={scaleStyle(fit.scale)}>
            <Markdown source={source} />
          </div>
        )}
      </section>
      {!empty && <PageFitNote fit={fit} />}
      {!empty && measurer}
    </div>
  );
}

/**
 * FR-23, FR-24: yazdırma alanı. Yazdırmadan hemen önce (window.print bu commit'in efektinde
 * çağrılır) ölçülür ve tek sayfaya sığdıran ölçek doğrudan öğeye yazılır.
 */
export function CvPrintArea({ source }: { source: string }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!measureRef.current || !printRef.current) return;
    const { scale } = fitToOnePage(measureRef.current);
    printRef.current.style.setProperty('--cv-scale', String(scale));
  }, [source]);
  return (
    <>
      <div ref={measureRef} aria-hidden className="cv-print cv-measure">
        <Markdown source={source} />
      </div>
      <div ref={printRef} className="print-area cv-print hidden" aria-hidden>
        <Markdown source={source} />
      </div>
    </>
  );
}

/** FR-23, FR-24: solda Markdown, sağda canlı PDF önizlemesi (dar ekranda alt alta). */
export function CvEditor({
  label,
  value,
  rows = 16,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  hint?: string;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const previewId = useId();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TextAreaField
        label={label}
        rows={rows}
        value={value}
        maxLength={MASTER_CV_MAX}
        hint={hint ?? t.cvTailor.preview.syntax}
        aria-controls={previewId}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          onChange(event.target.value);
        }}
      />
      <div id={previewId}>
        <p className="mb-1.5 text-sm font-semibold">{t.cvTailor.preview.label}</p>
        <CvPreview source={value} />
      </div>
    </div>
  );
}
