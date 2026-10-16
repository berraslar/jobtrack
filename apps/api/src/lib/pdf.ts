import { PDF_MAGIC } from '@jobtrack/shared';
import { AppError } from './errors.js';

const notPdf = () => new AppError(400, 'Dosya PDF değil.', 'invalid_file_type');

/** İçerik, uzantıdan ve bildirilen türden bağımsız olarak PDF imzasıyla doğrulanır (A06). */
const PDF_SIGNATURE = Buffer.from(PDF_MAGIC);

export function assertPdf(data: Buffer): void {
  if (!data.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) throw notPdf();
}
