import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv.js';
import { escapeText, foldLine, toIcs } from './ics.js';

describe('CSV (A05: CSV injection)', () => {
  it('formül gibi başlayan hücreleri metne çevirir', () => {
    for (const value of ['=HYPERLINK("http://kotu")', '+90 555', '-1', '@SUM(A1)', '\t=1']) {
      expect(csvCell(value).startsWith(`"'`)).toBe(true);
    }
  });

  it('tırnakları kaçışlar, normal değerlere dokunmaz', () => {
    expect(csvCell('Acme "Global"')).toBe('"Acme ""Global"""');
    expect(csvCell('Veri Analisti')).toBe('"Veri Analisti"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(-5)).toBe('"-5"');
  });

  it('BOM ve CRLF ile üretir; satır sonu içeren değer tek hücrede kalır', () => {
    const csv = toCsv(['A', 'B'], [['çok\nsatırlı', 'ş']]);
    expect(csv.startsWith('﻿"A","B"\r\n')).toBe(true);
    expect(csv).toContain('"çok\nsatırlı","ş"\r\n');
  });
});

describe('iCalendar (FR-17)', () => {
  it('kullanıcı metni yeni alan veya etkinlik açamaz', () => {
    expect(escapeText('a;b,c\\d\nEND:VEVENT')).toBe('a\\;b\\,c\\\\d\\nEND:VEVENT');
  });

  it('uzun satırları 75 bayttan katlar, çok baytlı karakteri bölmez', () => {
    const folded = foldLine(`SUMMARY:${'ş'.repeat(60)}`);
    for (const part of folded.split('\r\n'))
      expect(Buffer.byteLength(part)).toBeLessThanOrEqual(75);
    expect(folded.replaceAll('\r\n ', '')).toBe(`SUMMARY:${'ş'.repeat(60)}`);
  });

  it('geçerli bir takvim üretir', () => {
    const ics = toIcs('JobTrack', [
      {
        uid: 'abc@jobtrack',
        start: new Date('2026-10-10T11:00:00Z'),
        durationMinutes: 60,
        summary: 'Mülakat: Acme – Analist',
        description: 'Ayşe (İK)',
        updatedAt: new Date('2026-10-06T08:00:00Z'),
      },
    ]);
    expect(ics).toContain('BEGIN:VEVENT\r\nUID:abc@jobtrack\r\nDTSTAMP:20261006T080000Z\r\n');
    expect(ics).toContain('DTSTART:20261010T110000Z\r\nDURATION:PT60M\r\n');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
