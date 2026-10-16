import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { FOCUS_RING } from './ui';

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

/**
 * Dosya bırakma alanı (FR-08). Sürükle-bırakın yanında aynı işi yapan bir "Dosya seç" düğmesi
 * vardır; klavye ve dokunmatik kullanıcılar da dosya ekleyebilir (WCAG 2.1.1, 2.5.7).
 */
export function FileDropZone({
  accept,
  disabled,
  chooseLabel,
  chooseAriaLabel,
  onFiles,
  className = '',
  activeClassName = '!border-focus bg-lilac scale-[1.01]',
  children,
}: {
  accept: string;
  disabled?: boolean;
  chooseLabel: string;
  chooseAriaLabel?: string;
  onFiles: (files: File[]) => void;
  className?: string;
  activeClassName?: string;
  /** Alanın içeriği; `active` sürükleme sırasında true olur. */
  children: (state: { active: boolean; chooseButton: ReactNode }) => ReactNode;
}) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  // Alt öğelere girip çıkarken dragleave tetiklenir; derinlik sayılarak titreme önlenir.
  const depth = useRef(0);
  const [active, setActive] = useState(false);

  const reset = () => {
    depth.current = 0;
    setActive(false);
  };

  const chooseButton = (
    <>
      <input
        ref={input}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        // Sekme sırasında düğme yeterli; giriş alanı yine de adlandırılır (WCAG 4.1.2).
        tabIndex={-1}
        aria-label={chooseAriaLabel ?? chooseLabel}
        disabled={disabled}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // Aynı dosya yeniden seçilebilsin.
          event.target.value = '';
          if (files.length > 0) onFiles(files);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={chooseAriaLabel}
        onClick={() => input.current?.click()}
        className={`inline-flex min-h-10 items-center justify-center rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold whitespace-nowrap text-ink transition-colors duration-150 hover:border-ink/40 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
      >
        {chooseLabel}
      </button>
    </>
  );

  return (
    <div
      onDragEnter={(event) => {
        if (disabled || !hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setActive(true);
      }}
      onDragOver={(event) => {
        if (disabled || !hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setActive(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        reset();
        if (disabled) return;
        const files = [...event.dataTransfer.files];
        if (files.length > 0) onFiles(files);
      }}
      className={`${className} ${active ? activeClassName : ''}`}
    >
      {children({ active, chooseButton })}
    </div>
  );
}

/**
 * Bırakma alanını ıskalayan dosya, tarayıcının dosyayı açıp sayfadan çıkmasına yol açar.
 * Bu sayfadayken pencereye bırakılan dosyalar yok sayılır.
 */
export function preventStrayFileDrops(): () => void {
  const block = (event: globalThis.DragEvent) => {
    if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
  };
  window.addEventListener('dragover', block);
  window.addEventListener('drop', block);
  return () => {
    window.removeEventListener('dragover', block);
    window.removeEventListener('drop', block);
  };
}
