// FR-24: Ana CV ile uyarlanmış CV'nin yan yana fark görünümü. Bağımlılıksız (NFR-05): satırlar
// en uzun ortak alt dizi (LCS) ile eşlenir, değişen satır çiftlerinde kelimeler ayrıca karşılaştırılır.

export type Segment = { text: string; changed: boolean };

export type DiffRow =
  | { kind: 'same'; left: string; right: string }
  | { kind: 'changed'; left: Segment[]; right: Segment[] }
  | { kind: 'removed'; left: string }
  | { kind: 'added'; right: string };

/** LCS tablosunun üst sınırı; aşılırsa satırlar sırayla eşlenir (çok uzun belgede bellek koruması). */
const MAX_CELLS = 2_000_000;

type Op = { type: 'same' | 'removed' | 'added'; a?: string | undefined; b?: string | undefined };

function lcsOps(a: string[], b: string[]): Op[] {
  if (a.length * b.length > MAX_CELLS) {
    const ops: Op[] = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const left = a.at(i);
      const right = b.at(i);
      if (left !== undefined && left === right) ops.push({ type: 'same', a: left, b: right });
      else {
        if (left !== undefined) ops.push({ type: 'removed', a: left });
        if (right !== undefined) ops.push({ type: 'added', b: right });
      }
    }
    return ops;
  }
  const width = b.length + 1;
  const table = new Uint32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * width + j] ?? 0, table[i * width + j + 1] ?? 0);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ type: 'same', a: a[i], b: b[j] });
      i++;
      j++;
    } else if ((table[(i + 1) * width + j] ?? 0) >= (table[i * width + j + 1] ?? 0)) {
      ops.push({ type: 'removed', a: a[i] });
      i++;
    } else {
      ops.push({ type: 'added', b: b[j] });
      j++;
    }
  }
  for (; i < a.length; i++) ops.push({ type: 'removed', a: a[i] });
  for (; j < b.length; j++) ops.push({ type: 'added', b: b[j] });
  return ops;
}

/** Kelime (ve aradaki boşluk) düzeyinde fark: iki tarafın değişen parçaları işaretlenir. */
export function diffWords(left: string, right: string): { left: Segment[]; right: Segment[] } {
  const split = (text: string) => text.split(/(\s+)/).filter((part) => part !== '');
  const ops = lcsOps(split(left), split(right));
  const l: Segment[] = [];
  const r: Segment[] = [];
  const push = (list: Segment[], text: string, changed: boolean) => {
    const last = list.at(-1);
    if (last && last.changed === changed) last.text += text;
    else list.push({ text, changed });
  };
  for (const op of ops) {
    if (op.type === 'same') {
      push(l, op.a ?? '', false);
      push(r, op.b ?? '', false);
    } else if (op.type === 'removed') push(l, op.a ?? '', true);
    else push(r, op.b ?? '', true);
  }
  return { left: l, right: r };
}

/** Satır düzeyinde yan yana fark; ardışık silinen/eklenen satırlar çiftlenip kelime farkı alınır. */
export function diffLines(left: string, right: string): DiffRow[] {
  const ops = lcsOps(left.split('\n'), right.split('\n'));
  const rows: DiffRow[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    const pairs = Math.min(removed.length, added.length);
    for (let k = 0; k < pairs; k++) {
      rows.push({ kind: 'changed', ...diffWords(removed[k] ?? '', added[k] ?? '') });
    }
    for (const line of removed.slice(pairs)) rows.push({ kind: 'removed', left: line });
    for (const line of added.slice(pairs)) rows.push({ kind: 'added', right: line });
    removed = [];
    added = [];
  };
  for (const op of ops) {
    if (op.type === 'removed') removed.push(op.a ?? '');
    else if (op.type === 'added') added.push(op.b ?? '');
    else {
      flush();
      rows.push({ kind: 'same', left: op.a ?? '', right: op.b ?? '' });
    }
  }
  flush();
  return rows;
}

/** Değişen satır sayısı (özet ve ekran okuyucu için). */
export const changedRowCount = (rows: DiffRow[]) =>
  rows.filter((row) => row.kind !== 'same').length;
