import { describe, expect, it } from 'vitest';
import { changedRowCount, diffLines, diffWords } from './diff';

describe('diffLines (FR-24)', () => {
  it('aynı metinde değişiklik göstermez', () => {
    const rows = diffLines('a\nb', 'a\nb');
    expect(rows).toEqual([
      { kind: 'same', left: 'a', right: 'a' },
      { kind: 'same', left: 'b', right: 'b' },
    ]);
    expect(changedRowCount(rows)).toBe(0);
  });

  it('yer değiştiren, eklenen ve silinen satırları yan yana hizalar', () => {
    const rows = diffLines('# CV\n- SQL\n- Python\n- Excel', '# CV\n- Python\n- SQL\n- dbt');
    expect(rows.map((r) => r.kind)).toEqual(['same', 'removed', 'same', 'changed', 'added']);
    expect(changedRowCount(rows)).toBe(3);
  });

  it('değişen satırda yalnızca farklı kelimeleri işaretler', () => {
    expect(diffWords('Talep tahmini modelleri', 'Talep tahmini ve stok modelleri')).toEqual({
      left: [{ text: 'Talep tahmini modelleri', changed: false }],
      right: [
        { text: 'Talep tahmini ', changed: false },
        { text: 've stok ', changed: true },
        { text: 'modelleri', changed: false },
      ],
    });
  });

  it('çok uzun belgede de sonuç üretir', () => {
    const big = Array.from({ length: 3000 }, (_, i) => `satır ${String(i)}`).join('\n');
    const rows = diffLines(big, `${big}\nek`);
    expect(rows.at(-1)).toEqual({ kind: 'added', right: 'ek' });
  });
});
