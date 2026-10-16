import { CV_FILE_MAX_BYTES } from '@jobtrack/shared';
import { useI18n } from '../i18n';
import { checkCvFile } from './cv-file';

/** Bırakılan dosyaları denetler; sorun varsa bu dildeki metni, yoksa dosyayı döner. */
export function usePickCvFile() {
  const { t, formatFileSize } = useI18n();
  const p = t.cv.problems;
  return async (files: File[]): Promise<{ file: File } | { problem: string }> => {
    const [file] = files;
    if (!file || files.length > 1) return { problem: p.multiple };
    const problem = await checkCvFile(file);
    if (problem === 'tooLarge') return { problem: p.tooLarge(formatFileSize(CV_FILE_MAX_BYTES)) };
    if (problem) return { problem: p[problem] };
    return { file };
  };
}
