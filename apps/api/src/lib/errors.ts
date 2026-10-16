/** Kullanıcıya gösterilmesi güvenli bir mesaj taşıyan hata. Mesaj iç ayrıntı içermemelidir. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthorized = () => new AppError(401, 'Oturum açmanız gerekiyor.', 'unauthorized');
export const forbidden = () => new AppError(403, 'Bu işlem reddedildi.', 'forbidden');
export const notFound = () => new AppError(404, 'Bulunamadı.', 'not_found');
export const tooManyAttempts = () =>
  new AppError(429, 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.', 'rate_limited');

/**
 * Hatayı loga yazılabilir, hassas veri içermeyen bir özete çevirir (A09).
 * - Drizzle, başarısız sorgunun parametrelerini (parola hash'i, e-posta, notlar…) hata mesajına
 *   ve stack'in ilk satırına koyar; bunlar atılır, yalnızca parametresiz SQL metni kalır.
 * - PostgreSQL hata mesajı ve `detail` alanı girdi değerlerini içerebilir; yalnızca kod ve
 *   kısıt/tablo adı gibi şema bilgileri tutulur.
 */
export function toLoggableError(err: unknown, depth = 0): Record<string, unknown> {
  if (!(err instanceof Error)) return { type: typeof err };
  const frames = (err.stack ?? '')
    .split('\n')
    .filter((line) => line.trimStart().startsWith('at '))
    .join('\n');

  const fields = err as Error & Record<string, unknown>;
  const result: Record<string, unknown> = { type: err.name, stack: frames };

  if ('params' in fields && typeof fields.query === 'string') {
    result.message = 'Veritabanı sorgusu başarısız oldu';
    result.query = fields.query;
  } else if (typeof fields.code === 'string' && typeof fields.routine === 'string') {
    // Yalnızca değer içermeyen şema bilgileri; `message` ve `detail` girdi değeri içerebilir.
    Object.assign(result, {
      message: 'PostgreSQL hatası',
      code: fields.code,
      routine: fields.routine,
      severity: fields.severity,
      table: fields.table_name,
      column: fields.column_name,
      constraint: fields.constraint_name,
    });
  } else {
    result.message = err.message;
  }

  if (err.cause !== undefined && depth < 3) result.cause = toLoggableError(err.cause, depth + 1);
  return result;
}
