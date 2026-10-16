import { CV_FILE_MAX_BYTES, CV_FILE_TYPE, PDF_MAGIC } from '@jobtrack/shared';

export type CvFileProblem = 'empty' | 'tooLarge' | 'notPdf';

/**
 * Yüklemeden önce istemcide denetim (sunucu aynı kuralları yine uygular, ADR-0006).
 * Tür, uzantıya değil dosyanın ilk baytlarındaki PDF imzasına bakılarak belirlenir.
 */
export async function checkCvFile(file: File): Promise<CvFileProblem | null> {
  if (file.size === 0) return 'empty';
  if (file.size > CV_FILE_MAX_BYTES) return 'tooLarge';
  const head = new Uint8Array(await file.slice(0, PDF_MAGIC.length).arrayBuffer());
  return PDF_MAGIC.every((byte, i) => head[i] === byte) ? null : 'notPdf';
}

/** Bazı sistemler PDF'in türünü boş bildirir; gövde her zaman PDF türüyle gönderilir. */
export function asPdf(file: File): File {
  return file.type === CV_FILE_TYPE ? file : new File([file], file.name, { type: CV_FILE_TYPE });
}

/** "Berra_CV_Data-AI.pdf" → "Berra CV Data-AI" (etiket boş bırakılırsa). */
export function labelFromFileName(name: string): string {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .trim()
    .slice(0, 100);
}
