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
  polygon: [{ x, y: 0 }, { x: x + 1, y: 0 }, { x: x + 1, y: 1 }, { x, y: 1 }],
  offset,
  length: text.length,
});

const cell = (
  rowIndex: number,
  columnIndex: number,
  text: string,
  words: ReturnType<typeof word>[],
  isHeader = false
): RawCell => ({ rowIndex, columnIndex, isHeader, text, polygon: [], words });

describe('normalizeColKey', () => {
  it('strips parentheticals and dots, then upper-snake-cases the rest', () => {
    expect(normalizeColKey('Unit Price ($)')).toBe('UNIT_PRICE');
    expect(normalizeColKey('Qty.')).toBe('QTY');
    expect(normalizeColKey('  multiple   spaces ')).toBe('MULTIPLE_SPACES');
  });
});

describe('buildTable', () => {
  it('returns null for a table with no cells', () => {
    const t: RawTable = { id: 't1', rowCount: 0, columnCount: 0, cells: [], polygon: [], spans: [] };
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
      cells: [cell(0, 0, 'Widget', [word('Widget', 1, 0, 0)]), cell(0, 1, '5', [word('5', 1, 5, 50)])],
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

  it('emits nothing for a page with no tables', async () => {
    const page: RawPage = { pageIndex: 0, lines: [], tables: [] };
    const blocks = await nativeTableExtractor.run({ page, claimed: new Set(), hint: '', ai: {} as any });
    expect(blocks).toEqual([]);
  });
});

describe('plainTextExtractor', () => {
  it('turns every unclaimed line into a paragraph TextBlock', async () => {
    const page: RawPage = {
      pageIndex: 2,
      lines: [
        { id: 'l1', text: 'Claimed by a table', polygon: [], offset: 0, length: 1, confidence: 0.9 },
        { id: 'l2', text: 'Leftover line', polygon: [{ x: 0, y: 0 }], offset: 10, length: 1, confidence: 0.7 },
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
      { id: 'l1', text: 'Invoice Number: 42', polygon: [{ x: 0, y: 0 }], offset: 0, length: 19, confidence: 0.9 },
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

    expect(block).toMatchObject({ kind: 'field', key: 'INVOICE_NUMBER', label: 'Invoice Number', value: '42' });
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
            columns: [{ key: 'description', label: 'Description' }, { key: 'qty', label: 'Qty' }],
            rows: [
              { cells: [{ column: 'description', text: 'Widget', sources: ['l1'] }, { column: 'qty', text: '1', sources: ['l1'] }] },
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
