import { describe, it, expect } from 'vitest';
import {
  colStats,
  pickItemIndex,
  toVirtualRows,
  assignLevels,
  parentIndexes,
  dropInheritedCells,
  type LevelRow,
  type VCell,
  type VRow,
} from './hierarchy';
import type { RawCell, RawWord } from './layout';

// ───────────── builders ─────────────
const H = 0.1; // word height
const THRESH = H * 0.75; // same rule buildTable uses

let offset = 0;
const wordAt = (text: string, x: number, y: number): RawWord => ({
  text,
  confidence: 0.9,
  offset: (offset += 10),
  length: text.length,
  polygon: [
    { x, y },
    { x: x + 0.25, y },
    { x: x + 0.25, y: y + H },
    { x, y: y + H },
  ],
});

/** A visual line: [text, left x, top y]. Multi-word text is laid out left to right. */
type L = [text: string, x: number, y: number];

const cell = (row: number, col: number, lines: L[] = [], o: Partial<RawCell> = {}): RawCell => ({
  rowIndex: row,
  columnIndex: col,
  rowSpan: 1,
  columnSpan: 1,
  isHeader: false,
  text: lines.map(([t]) => t).join(' '),
  polygon: [],
  words: lines.flatMap(([t, x, y]) => t.split(' ').map((s, i) => wordAt(s, x + i * 0.3, y))),
  ...o,
});

const rows = (body: RawCell[], itemIdx: number) => toVirtualRows('t0', body, itemIdx, H, THRESH);
const itemTexts = (rs: VRow[]) => rs.map((r) => r.item?.text);
const textAt = (r: VRow, col: number) => r.cells.find((c) => c.columnIndex === col)?.text;

// ───────────── 1. item column ─────────────
describe('colStats / pickItemIndex', () => {
  it('colStats counts filled cells, characters and bullet markers', () => {
    expect(colStats(['- a', '', '- bb', 'plain'])).toEqual({ filled: 3, chars: 12, markers: 2 });
  });

  it('does not treat numbers or prices as markers', () => {
    expect(colStats(['5.00', '1.5', '10 pcs']).markers).toBe(0);
  });

  it('picks the column with the most filled cells', () => {
    const cols = [
      { filled: 2, chars: 99, markers: 0 },
      { filled: 5, chars: 10, markers: 0 },
    ];
    expect(pickItemIndex(cols)).toBe(1);
  });

  it('breaks ties on total text length, then on leftmost', () => {
    expect(
      pickItemIndex([
        { filled: 3, chars: 5, markers: 0 },
        { filled: 3, chars: 20, markers: 0 },
      ])
    ).toBe(1);
    expect(
      pickItemIndex([
        { filled: 3, chars: 5, markers: 0 },
        { filled: 3, chars: 5, markers: 0 },
      ])
    ).toBe(0);
  });

  it('a column full of bullet markers wins even over a wider, fuller column', () => {
    const cols = [
      { filled: 6, chars: 200, markers: 0 }, // long description
      { filled: 4, chars: 40, markers: 3 }, // "- CW630IPJ" ...
    ];
    expect(pickItemIndex(cols)).toBe(1);
  });

  it('ignores weak marker evidence: a single stray dash, or under half the column', () => {
    expect(
      pickItemIndex([
        { filled: 6, chars: 200, markers: 0 },
        { filled: 4, chars: 40, markers: 1 },
      ])
    ).toBe(0);
    expect(
      pickItemIndex([
        { filled: 10, chars: 200, markers: 0 },
        { filled: 8, chars: 40, markers: 3 }, // 3 of 8 < half
      ])
    ).toBe(0);
  });

  it('prefers the column with more markers when several qualify', () => {
    expect(
      pickItemIndex([
        { filled: 4, chars: 10, markers: 2 },
        { filled: 4, chars: 10, markers: 4 },
      ])
    ).toBe(1);
  });
});

// ───────────── 2. toVirtualRows: plain ─────────────
describe('toVirtualRows (plain rows)', () => {
  it('makes one row per Azure row, ordered by row index, with x = left edge of the item words', () => {
    const rs = rows([cell(2, 0, [['B', 1.4, 2]]), cell(1, 0, [['A', 1, 1]])], 0);
    expect(rs.map((r) => r.id)).toEqual(['t0_r1', 't0_r2']);
    expect(rs.map((r) => r.x)).toEqual([1, 1.4]);
  });

  it('x is null when the item cell has no words (cell box carries no indent information)', () => {
    const rs = rows([cell(1, 0, [], { text: 'typed' })], 0);
    expect(rs[0].x).toBeNull();
  });

  it('drops rows with no text', () => {
    const rs = rows([cell(1, 0, [['A', 1, 1]]), cell(2, 0, []), cell(3, 0, [['C', 1, 3]])], 0);
    expect(itemTexts(rs)).toEqual(['A', 'C']);
  });

  it('keeps a row whose item cell is empty but another cell has text', () => {
    const rs = rows([cell(1, 0, []), cell(1, 1, [['7', 5, 1]])], 0);
    expect(rs).toHaveLength(1);
    expect(rs[0].item?.text).toBe('');
  });
});

// ───────────── 2a. toVirtualRows: merged cells ─────────────
describe('toVirtualRows (merged cells)', () => {
  const grouped = () =>
    rows(
      [
        cell(1, 0, [['10', 0, 1]], { rowSpan: 3 }),
        cell(1, 1, [['A', 1, 1]]),
        cell(2, 1, [['B', 1, 2]]),
        cell(3, 1, [['C', 1, 3]]),
        cell(4, 1, [['D', 1, 4]]), // outside the span
      ],
      1
    );

  it('copies a merged label left of the item column onto every row it covers', () => {
    const rs = grouped();
    expect(rs.map((r) => textAt(r, 0))).toEqual(['10', '10', '10', undefined]);
  });

  it('marks the original and its copies with a shared spanId; only copies are inherited', () => {
    const [first, second] = grouped();
    const orig = first.cells.find((c) => c.columnIndex === 0)!;
    const copy = second.cells.find((c) => c.columnIndex === 0)!;
    expect(orig.spanId).toBe('1:0');
    expect(orig.inherited).toBeUndefined();
    expect(copy.spanId).toBe('1:0');
    expect(copy.inherited).toBe(true);
  });

  it('only spreads onto rows that exist (a span longer than the table is harmless)', () => {
    const rs = rows(
      [
        cell(1, 0, [['G', 0, 1]], { rowSpan: 50 }),
        cell(1, 1, [['A', 1, 1]]),
        cell(2, 1, [['B', 1, 2]]),
      ],
      1
    );
    expect(rs.map((r) => textAt(r, 0))).toEqual(['G', 'G']);
  });

  it('does not spread merged cells to the right of the item column', () => {
    const rs = rows(
      [
        cell(1, 0, [['A', 1, 1]]),
        cell(1, 1, [['note', 5, 1]], { rowSpan: 2 }),
        cell(2, 0, [['B', 1, 2]]),
      ],
      0
    );
    expect(rs.map((r) => textAt(r, 1))).toEqual(['note', undefined]);
  });

  it('does not spread an empty merged cell', () => {
    const rs = rows(
      [cell(1, 0, [], { rowSpan: 2 }), cell(1, 1, [['A', 1, 1]]), cell(2, 1, [['B', 1, 2]])],
      1
    );
    expect(rs.map((r) => textAt(r, 0))).toEqual(['', undefined]); // nothing was copied
    expect(rs.flatMap((r) => r.cells).some((c) => c.inherited)).toBe(false);
  });

  it('a covered row that is otherwise blank is NOT revived by the copy', () => {
    const rs = rows(
      [
        cell(1, 0, [['G', 0, 1]], { rowSpan: 3 }),
        cell(1, 1, [['A', 1, 1]]),
        cell(2, 0, []),
        cell(2, 1, []), // blank spacer row inside the span
        cell(3, 1, [['B', 1, 3]]),
      ],
      1
    );
    expect(rs.map((r) => r.id)).toEqual(['t0_r1', 't0_r3']);
    expect(textAt(rs[1], 0)).toBe('G');
  });
});

// ───────────── 2b. toVirtualRows: splitting a packed cell ─────────────
describe('toVirtualRows (packed item cell)', () => {
  const packed = () =>
    rows(
      [
        cell(1, 0, [
          ['CW630PJ', 1, 1],
          ['- CW630IPJ', 1.4, 1.2],
          ['- Tiles pack', 1.4, 1.4],
        ]),
        cell(1, 1, [
          ['1', 5, 1],
          ['2', 5, 1.2],
          ['3', 5, 1.4],
        ]),
        cell(2, 0, [['Plain', 1, 2]]),
      ],
      0
    );

  it('splits an indented parent/child cell into one virtual row per item', () => {
    const rs = packed();
    expect(itemTexts(rs)).toEqual(['CW630PJ', '- CW630IPJ', '- Tiles pack', 'Plain']);
    expect(rs.map((r) => r.id)).toEqual(['t0_r1', 't0_r1.1', 't0_r1.2', 't0_r2']);
  });

  it("gives each virtual row its own x, taken from that item's first line", () => {
    expect(packed().map((r) => r.x)).toEqual([1, 1.4, 1.4, 1]);
  });

  it('hands other columns to the item they sit next to vertically', () => {
    expect(packed().map((r) => textAt(r, 1))).toEqual(['1', '2', '3', undefined]);
  });

  it('shrinks the item polygon to the text, not the grid box', () => {
    const [parent] = packed();
    expect(parent.item!.polygon).toEqual([
      { x: 1, y: 1 },
      { x: 1.25, y: 1 },
      { x: 1.25, y: 1 + H },
      { x: 1, y: 1 + H },
    ]);
  });

  it('keeps a wrapped description whole (one left edge = nothing to split)', () => {
    const rs = rows(
      [
        cell(1, 0, [
          ['Long product name that', 1, 1],
          ['continues here', 1, 1.2],
        ]),
      ],
      0
    );
    expect(itemTexts(rs)).toEqual(['Long product name that continues here']);
  });

  it('treats a lowercase line at a deeper indent as a hanging-indent wrap of a bulleted item', () => {
    const rs = rows(
      [
        cell(1, 0, [
          ['Parent', 1, 1],
          ['- Child text', 1.4, 1.2],
          ['wraps here', 1.8, 1.4],
        ]),
      ],
      0
    );
    expect(itemTexts(rs)).toEqual(['Parent', '- Child text wraps here']);
  });

  it('treats a lowercase line at the same edge, or after a trailing comma, as a wrap', () => {
    const rs = rows(
      [
        cell(1, 0, [
          ['Parent', 1, 1],
          ['- Child,', 1.4, 1.2],
          ['Second part', 1.4, 1.4],
        ]),
      ],
      0
    );
    expect(itemTexts(rs)).toEqual(['Parent', '- Child, Second part']);
  });

  it('keeps a merged label on the FIRST virtual row only (nothing to align it by)', () => {
    const rs = rows(
      [
        cell(1, 0, [['7', 0, 1]], { rowSpan: 2 }),
        cell(1, 1, [
          ['Top', 1, 1],
          ['- sub', 1.4, 1.2],
        ]),
        cell(2, 1, [['Next', 1, 2]]),
      ],
      1
    );
    expect(rs.map((r) => r.id)).toEqual(['t0_r1', 't0_r1.1', 't0_r2']);
    expect(rs.map((r) => textAt(r, 0))).toEqual(['7', undefined, '7']);
  });

  it('keeps a text-only cell without words on the first virtual row', () => {
    const rs = rows(
      [
        cell(1, 0, [
          ['Top', 1, 1],
          ['- sub', 1.4, 1.2],
        ]),
        cell(1, 1, [], { text: 'typed' }),
      ],
      0
    );
    expect(rs.map((r) => textAt(r, 1))).toEqual(['typed', undefined]);
  });
});

// ───────────── 3. levels ─────────────
const lr = (itemText: string, x: number | null, texts?: Record<string, string>): LevelRow => ({
  itemText,
  x,
  texts: texts ?? { ITEM: itemText },
});
const levels = (rs: LevelRow[]) => assignLevels(rs, ['ITEM'], THRESH);

describe('assignLevels', () => {
  it('returns [] for no rows', () => {
    expect(levels([])).toEqual([]);
  });

  it('clusters left edges into levels, ignoring jitter below the threshold', () => {
    const rs = [lr('a', 1), lr('b', 1.4), lr('c', 1.43), lr('d', 1.01)];
    expect(levels(rs)).toEqual([0, 1, 1, 0]);
  });

  it('a row can nest at most one level deeper than the row before it', () => {
    const rs = [lr('a', 1), lr('b', 1.8), lr('c', 1.4)]; // 1.8 is level 2 by x, but follows level 0
    expect(levels(rs)).toEqual([0, 1, 1]);
  });

  it('a row with no geometry stays with the previous row', () => {
    expect(levels([lr('a', 1), lr('b', 1.4), lr('c', null)])).toEqual([0, 1, 1]);
    expect(levels([lr('c', null), lr('a', 1)])).toEqual([0, 0]);
  });

  it('outline numbering beats geometry', () => {
    const rs = [lr('1 Top', 1), lr('1.1 Sub', 1), lr('2 Next', 1)]; // same x everywhere
    expect(levels(rs)).toEqual([0, 1, 0]);
  });

  it('bullets nest under the last row without a bullet', () => {
    const rs = [lr('P1', 1), lr('- a', 1), lr('- b', 1), lr('P2', 1), lr('- c', 1)];
    expect(levels(rs)).toEqual([0, 1, 1, 0, 1]);
  });

  it('a bulleted list with no parent row stays flat', () => {
    expect(levels([lr('- a', 1), lr('- b', 1), lr('- c', 1)])).toEqual([0, 0, 0]);
  });

  it('a single stray bullet is not enough evidence to use markers', () => {
    expect(levels([lr('Parent', 1), lr('- one', 1), lr('Other', 1)])).toEqual([0, 0, 0]);
  });

  it('markers add to geometry rather than replacing it', () => {
    // a deeper-indented bullet still nests one step further than its neighbour
    const rs = [lr('P', 1), lr('- a', 1.4), lr('- b', 1.8), lr('- c', 1.4)];
    expect(levels(rs)).toEqual([0, 1, 2, 1]);
  });

  it('numbering outranks bullets', () => {
    const rs = [
      lr('1 Top', 1),
      lr('1.1 Sub', 1),
      lr('- note', 1),
      lr('- note', 1),
      lr('2 Next', 1),
    ];
    expect(levels(rs)[4]).toBe(0);
  });

  it('finds numbering in any column, not just the item column', () => {
    const mk = (no: string, d: string) => lr(d, 1, { NO: no, ITEM: d });
    const rs = [mk('1', 'a'), mk('1.1', 'b'), mk('1.2', 'c'), mk('2', 'd')];
    expect(assignLevels(rs, ['NO', 'ITEM'], THRESH)).toEqual([0, 1, 1, 0]);
  });
});

describe('parentIndexes', () => {
  it('returns [] for no rows', () => {
    expect(parentIndexes([])).toEqual([]);
  });

  it('top-level rows have no parent', () => {
    expect(parentIndexes([0, 0, 0])).toEqual([undefined, undefined, undefined]);
  });

  it('links each row to the nearest previous row one level up', () => {
    expect(parentIndexes([0, 1, 1, 0, 1, 2, 1])).toEqual([undefined, 0, 0, undefined, 3, 4, 3]);
  });
});

// ───────────── 4. merged-cell copies ─────────────
describe('dropInheritedCells', () => {
  const vc = (col: number, text: string, o: Partial<VCell> = {}): VCell => ({
    ...cell(1, col, [], { text }),
    ...o,
  });
  const origin = (): VCell => vc(0, '10', { spanId: '1:0' });
  const copy = (): VCell => vc(0, '10', { spanId: '1:0', inherited: true });
  const row = (id: string, ...cells: VCell[]): VRow => ({ id, cells, x: 1 });
  const labels = (rs: VRow[]) => rs.map((r) => r.cells.find((c) => c.columnIndex === 0)?.text);

  it('drops the copy on a row nested under the row that carries the original', () => {
    const rs = [row('a', origin(), vc(1, 'A')), row('b', copy(), vc(1, 'B'))];
    expect(labels(dropInheritedCells(rs, [undefined, 0]))).toEqual(['10', undefined]);
  });

  it('keeps the copy on siblings (same level) and later top-level rows', () => {
    const rs = [row('a', origin()), row('b', copy()), row('c', copy())];
    expect(labels(dropInheritedCells(rs, [undefined, undefined, undefined]))).toEqual([
      '10',
      '10',
      '10',
    ]);
  });

  it('drops it for grandchildren too, not just direct children', () => {
    const rs = [row('a', origin()), row('b', copy()), row('c', copy())];
    expect(labels(dropInheritedCells(rs, [undefined, 0, 1]))).toEqual(['10', undefined, undefined]);
  });

  it('children of a row that kept its copy inherit from that row', () => {
    const rs = [row('a', origin()), row('b', copy()), row('c', copy())];
    // b is a sibling of a (keeps its copy), c is b's child (inherits it from b)
    expect(labels(dropInheritedCells(rs, [undefined, undefined, 1]))).toEqual([
      '10',
      '10',
      undefined,
    ]);
  });

  it('never drops original cells or cells that are not part of a merge', () => {
    const rs = [row('a', origin()), row('b', vc(0, 'plain'), vc(1, 'x'))];
    const out = dropInheritedCells(rs, [undefined, 0]);
    expect(labels(out)).toEqual(['10', 'plain']);
    expect(out[1].cells).toHaveLength(2);
  });

  it('keeps copies of a DIFFERENT merged cell', () => {
    const other = vc(0, 'X', { spanId: '9:0', inherited: true });
    const rs = [row('a', origin()), row('b', other)];
    expect(labels(dropInheritedCells(rs, [undefined, 0]))).toEqual(['10', 'X']);
  });

  it('does not mutate its input', () => {
    const rs = [row('a', origin()), row('b', copy())];
    dropInheritedCells(rs, [undefined, 0]);
    expect(rs[1].cells).toHaveLength(1);
  });
});
