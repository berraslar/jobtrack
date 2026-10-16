// Tarih ve sayı biçimlendirme dile bağlıdır; bkz. i18n (formatDate, formatDateTime).

/** `<input type="datetime-local">` değeri ↔ ISO zaman damgası (tarayıcının saat dilimiyle). */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

/** Formdaki boş metin "değer yok" demektir. */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
