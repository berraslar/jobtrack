/** RFC 5545 iCalendar (FR-17). */

export interface CalendarEvent {
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description?: string | null;
  /** Değişiklik zamanı; takvim uygulamaları güncellemeyi buna göre algılar. */
  updatedAt: Date;
}

/** Metin değerlerindeki özel karakterler kaçışlanır; kullanıcı girdisi yeni alan veya satır açamaz. */
export function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const utc = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** 75 baytı aşan satırlar katlanır (RFC 5545 §3.1); çok baytlı karakter bölünmez. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

export function toIcs(calendarName: string, events: CalendarEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JobTrack//TR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${utc(event.updatedAt)}`,
      `DTSTART:${utc(event.start)}`,
      `DURATION:PT${String(event.durationMinutes)}M`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
