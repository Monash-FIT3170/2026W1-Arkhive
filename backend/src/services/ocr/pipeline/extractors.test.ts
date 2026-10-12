import { describe, it, expect, vi } from 'vitest';
import {
  normalizeColKey,
  buildTable,
  nativeTableExtractor,
  plainTextExtractor,
  llmStructurer,
} from './extractors';
import type { RawCell, RawPage, RawTable } from './layout';

const word = (text: string, confidence: number, offset: number, x: number) => ({
  text,
  confidence,
  polygon: [
    { x, y: 0 },
    { x: x + 1, y: 0 },
    { x: x + 1, y: 1 },
    { x, y: 1 },
  ],
  offset,
  length: text.length,
});

const cell = (
  rowIndex: number,
  columnIndex: number,
  text: string,
  words: ReturnType<typeof word>[],
  isHeader = false
): RawCell => ({
  rowIndex,
  columnIndex,
  rowSpan: 1,
  columnSpan: 1,
  isHeader,
  text,
  polygon: [],
  words,
});

// ── geometry-aware builders (word height 0.1, so buildTable's indent threshold is 0.075) ──
const H = 0.1;
let off = 1000;
type L = [text: string, x: number, y: number];
const at = (
  lines: L[],
  rowIndex: number,
  columnIndex: number,
  o: Partial<RawCell> = {}
): RawCell => ({
  rowIndex,
  columnIndex,
  rowSpan: 1,
  columnSpan: 1,
  isHeader: false,
  text: lines.map(([t]) => t).join(' '),
  polygon: [],
  words: lines.map(([t, x, y]) => ({
    text: t,
    confidence: 0.9,
    offset: (off += 10),
    length: t.length,
    polygon: [
      { x, y },
      { x: x + 0.25, y },
      { x: x + 0.25, y: y + H },
      { x, y: y + H },
    ],
  })),
  ...o,
});
const header = (columnIndex: number, text: string) => cell(0, columnIndex, text, [], true);
const table = (columnCount: number, cells: RawCell[]): RawTable => ({
  id: 't0',
  rowCount: 99,
  columnCount,
  polygon: [],
  spans: [],
  cells,
});
const levelsOf = (t: RawTable) => buildTable(t, 1)!.rows.map((r) => r.level);

describe('normalizeColKey', () => {
  it('strips parentheticals and dots, then upper-snake-cases the rest', () => {
    expect(normalizeColKey('Unit Price ($)')).toBe('UNIT_PRICE');
    expect(normalizeColKey('Qty.')).toBe('QTY');
    expect(normalizeColKey('  multiple   spaces ')).toBe('MULTIPLE_SPACES');
  });
});

describe('buildTable', () => {
  it('returns null for a table with no cells', () => {
    const t: RawTable = {
      id: 't1',
      rowCount: 0,
      columnCount: 0,
      cells: [],
      polygon: [],
      spans: [],
    };
    expect(buildTable(t, 1)).toBeNull();
  });

  it('builds columns from the header row, keyed and labeled, non-inferred', () => {
    const t: RawTable = {
      id: 't1',
      rowCount: 2,
      columnCount: 2,
      polygon: [],
      spans: [],
      cells: [
        cell(0, 0, 'Description', [], true),
        cell(0, 1, 'Amount', [], true),
        cell(1, 0, 'Widget', [word('Widget', 0.9, 0, 0)]),
        cell(1, 1, '$5.00', [word('$5.00', 0.8, 10, 50)]),
      ],
    };

    const block = buildTable(t, 1)!;
    expect(block.columns).toEqual([
      { key: 'DESCRIPTION', label: 'Description', inferred: false },
      { key: 'AMOUNT', label: 'Amount', inferred: false },
    ]);
    expect(block.rows).toHaveLength(1);
    expect(block.rows[0].cells.DESCRIPTION.text).toBe('Widget');
    expect(block.rows[0].cells.AMOUNT.text).toBe('$5.00');
  });

  it('falls back to COL_n / inferred:true when there is no header row', () => {
    const t: RawTable = {
      id: 't1',
      rowCount: 1,
      columnCount: 2,
      polygon: [],
      spans: [],
      cells: [
        cell(0, 0, 'Widget', [word('Widget', 1, 0, 0)]),
        cell(0, 1, '5', [word('5', 1, 5, 50)]),
      ],
    };

    const block = buildTable(t, 1)!;
    expect(block.columns.map((c) => c.key)).toEqual(['COL_1', 'COL_2']);
    expect(block.columns.every((c) => c.inferred)).toBe(true);
  });

  it('de-duplicates repeated header labels with a numeric suffix', () => {
    const t: RawTable = {
      id: 't1',
      rowCount: 1,
      columnCount: 3,
      polygon: [],
      spans: [],
      cells: [
        cell(0, 0, 'Date', [], true),
        cell(0, 1, 'Date', [], true),
        cell(0, 2, 'Date', [], true),
      ],
    };

    const block = buildTable(t, 1)!;
    expect(block.columns.map((c) => c.key)).toEqual(['DATE', 'DATE_2', 'DATE_3']);
  });

  it('picks the item column as whichever has the most filled, longest cells', () => {
    const t: RawTable = {
      id: 't1',
      rowCount: 1,
      columnCount: 2,
      polygon: [],
      spans: [],
      cells: [
        cell(0, 0, 'A', [word('A', 1, 0, 0)], true),
        cell(0, 1, 'A long description column', [], true),
        cell(1, 0, 'A', [word('A', 1, 10, 0)]),
        cell(1, 1, 'A long description column', [word('x', 1, 20, 50)]),
      ],
    };

    const block = buildTable(t, 1)!;
    expect(block.itemColumnKey).toBe(block.columns[1].key);
  });

  it('skips rows with no non-empty cell text', () => {
    const t: RawTable = {
      id: 't1',
      rowCount: 2,
      columnCount: 1,
      polygon: [],
      spans: [],
      cells: [
        cell(0, 0, 'Item', [], true),
        cell(1, 0, '', []), // blank row
        cell(2, 0, 'Real row', [word('Real row', 1, 0, 0)]),
      ],
    };

    const block = buildTable(t, 1)!;
    expect(block.rows).toHaveLength(1);
    expect(block.rows[0].cells.ITEM.text).toBe('Real row');
  });

  it('derives nested levels from outline numbering when the item column has it', () => {
    // Numbering detection needs >= 3 matched rows (see numbering.ts), hence three body rows.
    const t: RawTable = {
      id: 't1',
      rowCount: 4,
      columnCount: 1,
      polygon: [],
      spans: [],
      cells: [
        cell(0, 0, 'Item', [], true),
        cell(1, 0, '1 Parent', [word('1 Parent', 1, 0, 0)]),
        cell(2, 0, '1.1 Child', [word('1.1 Child', 1, 10, 5)]),
        cell(3, 0, '2 Parent two', [word('2 Parent two', 1, 20, 0)]),
      ],
    };

    const block = buildTable(t, 1)!;
    expect(block.rows.map((r) => r.level)).toEqual([0, 1, 0]);
    expect(block.rows[1].parentId).toBe(block.rows[0].id);
  });

  it('sets each row confidence to the min confidence of its cells', () => {
    const t: RawTable = {
      id: 't1',
      rowCount: 1,
      columnCount: 2,
      polygon: [],
      spans: [],
      cells: [
        cell(0, 0, 'Item', [], true),
        cell(0, 1, 'Amount', [], true),
        cell(1, 0, 'Widget', [word('Widget', 0.9, 0, 0)]),
        cell(1, 1, '$5', [word('$5', 0.4, 10, 50)]),
      ],
    };

    const block = buildTable(t, 1)!;
    expect(block.rows[0].confidence).toBeCloseTo(0.4);
  });
});

describe('buildTable: hierarchy', () => {
  it('nests rows by the left edge of the item text and links parentId', () => {
    const t = table(2, [
      header(0, 'Item'),
      header(1, 'Qty'),
      at([['Parent A', 1, 1]], 1, 0),
      at([['1', 5, 1]], 1, 1),
      at([['Child', 1.4, 2]], 2, 0),
      at([['2', 5, 2]], 2, 1),
      at([['Parent B', 1, 3]], 3, 0),
      at([['3', 5, 3]], 3, 1),
    ]);
    const block = buildTable(t, 1)!;
    expect(block.rows.map((r) => r.level)).toEqual([0, 1, 0]);
    expect(block.rows.map((r) => r.parentId)).toEqual([undefined, block.rows[0].id, undefined]);
  });

  it('splits one Azure cell holding "Parent / - Child / - Child" into nested rows', () => {
    const t = table(2, [
      header(0, 'Item'),
      header(1, 'Qty'),
      at(
        [
          ['CW630PJ', 1, 1],
          ['- CW630IPJ', 1.4, 1.2],
          ['- Tiles', 1.4, 1.4],
        ],
        1,
        0
      ),
      at(
        [
          ['1', 5, 1],
          ['2', 5, 1.2],
          ['3', 5, 1.4],
        ],
        1,
        1
      ),
    ]);
    const block = buildTable(t, 1)!;
    expect(block.rows.map((r) => [r.id, r.level, r.cells.ITEM.text, r.cells.QTY.text])).toEqual([
      ['t0_r1', 0, 'CW630PJ', '1'],
      ['t0_r1.1', 1, '- CW630IPJ', '2'],
      ['t0_r1.2', 1, '- Tiles', '3'],
    ]);
    expect(block.rows[2].parentId).toBe('t0_r1');
  });

  it('uses the bullet column as the item column even when another column is wider', () => {
    const t = table(2, [
      header(0, 'Item'),
      header(1, 'Remarks'),
      at([['A', 1, 1]], 1, 0),
      at([['- first', 1, 1]], 1, 1),
      at([['B', 1, 2]], 2, 0),
      at([['- second', 1, 2]], 2, 1),
      at([['C', 1, 3]], 3, 0),
      at([['- third', 1, 3]], 3, 1),
    ]);
    expect(buildTable(t, 1)!.itemColumnKey).toBe('REMARKS');
  });

  it('numbering ignores merged-cell copies, so a group column cannot be mistaken for an outline', () => {
    const t = table(2, [
      header(0, 'Grp'),
      header(1, 'Item'),
      at([['1', 0, 1]], 1, 0, { rowSpan: 4 }),
      at([['A', 1, 1]], 1, 1),
      at([['B', 1, 2]], 2, 1),
      at([['C', 1, 3]], 3, 1),
      at([['D', 1, 4]], 4, 1),
    ]);
    expect(levelsOf(t)).toEqual([0, 0, 0, 0]);
  });
});

describe('buildTable: merged cells', () => {
  // "10" spans rows 1-5; Parent B has a child; row 6 is outside the span.
  const merged = () =>
    table(3, [
      header(0, 'Grp'),
      header(1, 'Item'),
      header(2, 'Qty'),
      at([['10', 0, 1]], 1, 0, { rowSpan: 5 }),
      at([['Parent A', 1, 1]], 1, 1),
      at([['Child', 1.4, 2]], 2, 1),
      at([['Parent B', 1, 3]], 3, 1),
      at([['Child of B', 1.4, 4]], 4, 1),
      at([['Sibling', 1, 5]], 5, 1),
      at([['Other', 1, 6]], 6, 1),
    ]);

  it('repeats a left-of-item merged value on every covered row that is not nested under a row carrying it', () => {
    const rows = buildTable(merged(), 1)!.rows;
    expect(rows.map((r) => [r.cells.ITEM.text, r.cells.GRP?.text])).toEqual([
      ['Parent A', '10'], // original
      ['Child', undefined], // nested under Parent A: inherits downstream
      ['Parent B', '10'], // copy
      ['Child of B', undefined], // nested under a row that holds the copy
      ['Sibling', '10'], // copy
      ['Other', undefined], // outside the span
    ]);
  });

  it('does not let a copy revive an otherwise blank row inside the span', () => {
    const t = table(2, [
      header(0, 'Grp'),
      header(1, 'Item'),
      at([['G', 0, 1]], 1, 0, { rowSpan: 3 }),
      at([['A', 1, 1]], 1, 1),
      cell(2, 0, '', []),
      cell(2, 1, '', []),
      at([['B', 1, 3]], 3, 1),
    ]);
    expect(buildTable(t, 1)!.rows.map((r) => r.cells.ITEM.text)).toEqual(['A', 'B']);
  });
});

describe('buildTable: confidence of split rows', () => {
  it('uses the words that stayed in each slice, not the whole cell', () => {
    const lo = at([['- low', 1.4, 1.2]], 1, 0).words[0];
    const top = at([['Top', 1, 1]], 1, 0).words[0];
    const item = at(
      [
        ['Top', 1, 1],
        ['- low', 1.4, 1.2],
      ],
      1,
      0
    );
    item.words = [
      { ...top, confidence: 0.95, offset: 1 },
      { ...lo, confidence: 0.3, offset: 2 },
    ];
    const block = buildTable(table(1, [header(0, 'Item'), item]), 1)!;
    expect(block.rows.map((r) => r.confidence)).toEqual([0.95, 0.3]);
  });
});

describe('nativeTableExtractor', () => {
  it('emits one TableBlock per Azure table and marks its lines as claimed', () => {
    const page: RawPage = {
      pageIndex: 0,
      lines: [
        { id: 'l1', text: 'Widget', polygon: [], offset: 0, length: 6, confidence: 1 },
        { id: 'l2', text: 'unrelated', polygon: [], offset: 100, length: 9, confidence: 1 },
      ],
      tables: [
        {
          id: 't1',
          rowCount: 1,
          columnCount: 1,
          polygon: [],
          spans: [{ offset: 0, length: 6 }],
          cells: [cell(0, 0, 'Widget', [word('Widget', 1, 0, 0)])],
        },
      ],
    };
    const claimed = new Set<string>();

    return nativeTableExtractor.run({ page, claimed, hint: '', ai: {} as any }).then((blocks) => {
      expect(blocks).toHaveLength(1);
      expect(blocks[0].kind).toBe('table');
      expect(claimed.has('l1')).toBe(true);
      expect(claimed.has('l2')).toBe(false);
    });
  });

  it('does not claim lines for a table that has no cells', async () => {
    const page: RawPage = {
      pageIndex: 0,
      lines: [{ id: 'l1', text: 'x', polygon: [], offset: 0, length: 1, confidence: 1 }],
      tables: [
        {
          id: 't1',
          rowCount: 0,
          columnCount: 0,
          polygon: [],
          spans: [{ offset: 0, length: 1 }],
          cells: [],
        },
      ],
    };
    const claimed = new Set<string>();
    const blocks = await nativeTableExtractor.run({ page, claimed, hint: '', ai: {} as any });
    expect(blocks).toEqual([]);
    expect(claimed.size).toBe(0);
  });

  it('emits nothing for a page with no tables', async () => {
    const page: RawPage = { pageIndex: 0, lines: [], tables: [] };
    const blocks = await nativeTableExtractor.run({
      page,
      claimed: new Set(),
      hint: '',
      ai: {} as any,
    });
    expect(blocks).toEqual([]);
  });
});

describe('plainTextExtractor', () => {
  it('turns every unclaimed line into a paragraph TextBlock', async () => {
    const page: RawPage = {
      pageIndex: 2,
      lines: [
        {
          id: 'l1',
          text: 'Claimed by a table',
          polygon: [],
          offset: 0,
          length: 1,
          confidence: 0.9,
        },
        {
          id: 'l2',
          text: 'Leftover line',
          polygon: [{ x: 0, y: 0 }],
          offset: 10,
          length: 1,
          confidence: 0.7,
        },
      ],
      tables: [],
    };
    const claimed = new Set(['l1']);

    const blocks = await plainTextExtractor.run({ page, claimed, hint: '', ai: {} as any });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'text',
      id: 'l2',
      role: 'paragraph',
      text: 'Leftover line',
      confidence: 0.7,
      region: { page: 3, polygon: [{ x: 0, y: 0 }] }, // 1-based page
    });
  });
});

describe('llmStructurer', () => {
  const page: RawPage = {
    pageIndex: 0,
    lines: [
      {
        id: 'l1',
        text: 'Invoice Number: 42',
        polygon: [{ x: 0, y: 0 }],
        offset: 0,
        length: 19,
        confidence: 0.9,
      },
    ],
    tables: [],
  };

  it('returns nothing without calling Gemini when every line is already claimed', async () => {
    const generateContent = vi.fn();
    const blocks = await llmStructurer.run({
      page,
      claimed: new Set(['l1']),
      hint: '',
      ai: { models: { generateContent } } as any,
    });
    expect(blocks).toEqual([]);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('turns a field response into a FieldBlock, grounded and confidence-checked against its source line', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        fields: [{ key: 'invoice number', label: 'Invoice Number', value: '42', sources: ['l1'] }],
        tables: [],
        text: [],
      }),
    });

    const [block] = await llmStructurer.run({
      page,
      claimed: new Set(),
      hint: 'some hint',
      ai: { models: { generateContent } } as any,
    });

    expect(block).toMatchObject({
      kind: 'field',
      key: 'INVOICE_NUMBER',
      label: 'Invoice Number',
      value: '42',
    });
    expect((block as any).confidence).toBeCloseTo(0.9); // value found verbatim in its source line
  });

  it('halves confidence when the value does not actually appear in its claimed sources (hallucination guard)', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        fields: [{ key: 'total', label: 'Total', value: 'made up value', sources: ['l1'] }],
        tables: [],
        text: [],
      }),
    });

    const [block] = await llmStructurer.run({
      page,
      claimed: new Set(),
      hint: '',
      ai: { models: { generateContent } } as any,
    });

    expect((block as any).confidence).toBeLessThanOrEqual(0.4);
  });

  it('builds a TableBlock from the LLM response with normalized column keys and an item column', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        fields: [],
        tables: [
          {
            columns: [
              { key: 'description', label: 'Description' },
              { key: 'qty', label: 'Qty' },
            ],
            rows: [
              {
                cells: [
                  { column: 'description', text: 'Widget', sources: ['l1'] },
                  { column: 'qty', text: '1', sources: ['l1'] },
                ],
              },
            ],
          },
        ],
        text: [],
      }),
    });

    const [block] = await llmStructurer.run({
      page,
      claimed: new Set(),
      hint: '',
      ai: { models: { generateContent } } as any,
    });

    expect(block.kind).toBe('table');
    if (block.kind === 'table') {
      expect(block.columns.map((c) => c.key)).toEqual(['DESCRIPTION', 'QTY']);
      expect(block.itemColumnKey).toBe('DESCRIPTION'); // longer text than '1'
      expect(block.rows[0].cells.DESCRIPTION.text).toBe('Widget');
    }
  });

  it('drops a table response with no columns or no rows', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        fields: [],
        tables: [{ columns: [], rows: [] }],
        text: [],
      }),
    });

    const blocks = await llmStructurer.run({
      page,
      claimed: new Set(),
      hint: '',
      ai: { models: { generateContent } } as any,
    });
    expect(blocks).toEqual([]);
  });

  it('maps a text entry straight to a TextBlock with its role', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        fields: [],
        tables: [],
        text: [{ role: 'footer', text: 'Page 1 of 1', sources: ['l1'] }],
      }),
    });

    const [block] = await llmStructurer.run({
      page,
      claimed: new Set(),
      hint: '',
      ai: { models: { generateContent } } as any,
    });

    expect(block).toMatchObject({ kind: 'text', role: 'footer', text: 'Page 1 of 1' });
  });

  describe('table hierarchy', () => {
    const line = (id: string, text: string, x: number, y: number) => ({
      id,
      text,
      confidence: 0.9,
      offset: 0,
      length: text.length,
      polygon: [
        { x, y },
        { x: x + 1, y },
        { x: x + 1, y: y + H },
        { x, y: y + H },
      ],
    });
    const run = (lines: ReturnType<typeof line>[], rows: [string, string][]) => {
      const generateContent = vi.fn().mockResolvedValue({
        text: JSON.stringify({
          fields: [],
          text: [],
          tables: [
            {
              columns: [{ key: 'description', label: 'Description' }],
              rows: rows.map(([text, src]) => ({
                cells: [{ column: 'description', text, sources: [src] }],
              })),
            },
          ],
        }),
      });
      return llmStructurer
        .run({
          page: { pageIndex: 0, lines, tables: [] },
          claimed: new Set(),
          hint: '',
          ai: { models: { generateContent } } as any,
        })
        .then(([b]) => (b as Extract<typeof b, { kind: 'table' }>).rows);
    };

    it("derives levels from the left edge of each row's first source line and sets parentId", async () => {
      const rows = await run(
        [line('a', 'Parent', 1, 1), line('b', 'Child', 1.5, 2), line('c', 'Parent two', 1, 3)],
        [
          ['Parent', 'a'],
          ['Child', 'b'],
          ['Parent two', 'c'],
        ]
      );
      expect(rows.map((r) => r.level)).toEqual([0, 1, 0]);
      expect(rows.map((r) => r.parentId)).toEqual([undefined, rows[0].id, undefined]);
    });

    it('nests "- " bullet rows under the preceding plain row, like native tables do', async () => {
      const rows = await run(
        [line('a', 'Parent', 1, 1), line('b', '- one', 1, 2), line('c', '- two', 1, 3)],
        [
          ['Parent', 'a'],
          ['- one', 'b'],
          ['- two', 'c'],
        ]
      );
      expect(rows.map((r) => r.level)).toEqual([0, 1, 1]);
    });

    it('keeps rows flat when the source lines have no geometry to compare', async () => {
      const rows = await run(
        [line('a', 'One', 1, 1), line('b', 'Two', 1, 2)],
        [
          ['One', 'a'],
          ['Two', 'missing-id'],
        ]
      );
      expect(rows.map((r) => r.level)).toEqual([0, 0]);
    });
  });

  it('tolerates a response missing text entirely (JSON.parse of "{}")', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: undefined });
    const blocks = await llmStructurer.run({
      page,
      claimed: new Set(),
      hint: '',
      ai: { models: { generateContent } } as any,
    });
    expect(blocks).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KNOWN LIMITATIONS. Each test states the behaviour we WANT and is marked
// `it.fails`, so the suite stays green while the bug exists and goes red the
// moment it is fixed - delete the `.fails` then and keep it as a regression test.
// ─────────────────────────────────────────────────────────────────────────────
describe('known limitations (geometry heuristics)', () => {
  const flat = (xs: number[]) =>
    table(1, [header(0, 'Item'), ...xs.map((x, i) => at([[`Item ${i}`, x, i + 1]], i + 1, 0))]);

  it.fails('one stray left-shifted row does not nest the whole table under it', () => {
    expect(levelsOf(flat([0.5, 1, 1, 1, 1]))).toEqual([0, 0, 0, 0, 0]);
  });

  it.fails('centred / right-aligned item text does not produce a staircase of levels', () => {
    expect(levelsOf(flat([1, 1.3, 1.1, 1.6, 1.2]))).toEqual([0, 0, 0, 0, 0]);
  });

  it.fails('a wrapped, centred description cell is not split into parent + child', () => {
    const t = table(1, [
      header(0, 'Item'),
      at(
        [
          ['Black Leather', 1, 1],
          ['Wallet', 1.45, 1.2],
        ],
        1,
        0
      ),
      at([['Pen', 1, 2]], 2, 0),
    ]);
    expect(buildTable(t, 1)!.rows).toHaveLength(2);
  });

  it.fails('a slightly skewed multi-line cell is not split into one row per line', () => {
    const lines: L[] = ['Acme Ltd', '12 Main St', 'Springfield', 'USA'].map(
      (s, i) => [s, 1 + i * 0.04, 1 + i * 0.15] as L
    );
    const t = table(1, [header(0, 'Item'), at(lines, 1, 0), at([['Pen', 1, 2]], 2, 0)]);
    expect(buildTable(t, 1)!.rows).toHaveLength(2);
  });

  it.fails(
    'a right-aligned Qty column is not picked as the item column just because it is always filled',
    () => {
      const qtyX = [4.9, 4.8, 4.7, 4.9, 4.6];
      const t = table(2, [
        header(0, 'Desc'),
        header(1, 'Qty'),
        ...['Pen', '', 'Ink', '', 'Pad'].flatMap((d, i) => [
          ...(d ? [at([[d, 1, i + 1]], i + 1, 0)] : []),
          at([[['5', '12', '100', '7', '1000'][i], qtyX[i], i + 1]], i + 1, 1),
        ]),
      ]);
      expect(buildTable(t, 1)!.itemColumnKey).toBe('DESC');
    }
  );
});
