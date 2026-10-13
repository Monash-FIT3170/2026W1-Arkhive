import { describe, it, expect } from 'vitest';
import {
  tableToExtractedData,
  pickPrimaryTable,
  pageToExtractedPage,
  switchActiveTable,
  listTables,
} from './flattener';
import type { Block, Cell, TableBlock, TableRow, FieldBlock, TextBlock } from '../models/Document';
import type { ExtractedPage } from '../models/TableData';

const cell = (text: string, confidence = 0.9): Cell => ({ text, confidence });

const row = (
  id: string,
  level: number,
  cells: Record<string, Cell>,
  confidence = 0.9
): TableRow => ({ id, level, cells, confidence });

function table(overrides: Partial<TableBlock> & { id: string }): TableBlock {
  return {
    kind: 'table',
    confidence: 0.9,
    columns: [],
    itemColumnKey: '',
    rows: [],
    ...overrides,
  };
}

describe('tableToExtractedData', () => {
  it('flattens a flat (unindented) table 1:1, with no SUB_ columns', () => {
    const block = table({
      id: 't1',
      columns: [{ key: 'ITEM', label: 'Item' }, { key: 'QTY', label: 'Qty' }],
      itemColumnKey: 'ITEM',
      rows: [
        row('r1', 0, { ITEM: cell('Widget'), QTY: cell('3') }),
        row('r2', 0, { ITEM: cell('Gadget'), QTY: cell('1') }),
      ],
    });

    const data = tableToExtractedData(block);

    expect(data.columns).toEqual(['ITEM', 'QTY']);
    expect(data.itemColumnKey).toBe('ITEM');
    expect(data.rows).toHaveLength(2);
    expect(data.rows[0]).toMatchObject({ _id: 'r1', ITEM: 'Widget', QTY: '3', _indentLevel: 0 });
  });

  it('builds SUB_ columns for nested rows, carrying the root value forward and the child text into SUB_', () => {
    // CODE is left of the item column (inherits down when a row omits it);
    // ITEM is the item column; QTY is right of it (row-own only).
    const block = table({
      id: 't1',
      columns: [
        { key: 'CODE', label: 'Code' },
        { key: 'ITEM', label: 'Item' },
        { key: 'QTY', label: 'Qty' },
      ],
      itemColumnKey: 'ITEM',
      rows: [
        row('r0', 0, { CODE: cell('C1', 0.9), ITEM: cell('Parent', 0.9) }, 0.9),
        row('r1', 1, { ITEM: cell('Child', 0.8), QTY: cell('5', 0.8) }, 0.8),
        row('r2', 0, { CODE: cell('C2', 0.95), ITEM: cell('Parent2', 0.95), QTY: cell('10', 0.95) }, 0.95),
      ],
    });

    const data = tableToExtractedData(block);

    expect(data.columns).toEqual(['CODE', 'ITEM', 'SUB_ITEM_1', 'QTY']);

    const [r0, r1, r2] = data.rows;
    expect(r0).toMatchObject({ CODE: 'C1', ITEM: 'Parent', SUB_ITEM_1: '', QTY: '', _indentLevel: 0 });
    // r1 has no CODE cell of its own -> inherits the nearest ancestor's (r0's).
    expect(r1).toMatchObject({ CODE: 'C1', ITEM: 'Parent', SUB_ITEM_1: 'Child', QTY: '5', _indentLevel: 1 });
    expect(r1._cellKeyMap?.CODE).toBe('r0:CODE'); // grounded in the row it was actually inherited from
    expect(r1._cellKeyMap?.SUB_ITEM_1).toBe('r1:ITEM');
    expect(r2).toMatchObject({ CODE: 'C2', ITEM: 'Parent2', SUB_ITEM_1: '', QTY: '10', _indentLevel: 0 });
  });

  it('falls back to the row confidence when a cell is missing', () => {
    const block = table({
      id: 't1',
      columns: [{ key: 'ITEM', label: 'Item' }, { key: 'QTY', label: 'Qty' }],
      itemColumnKey: 'ITEM',
      rows: [row('r1', 0, { ITEM: cell('Widget', 0.9) }, 0.6)], // no QTY cell at all
    });

    const data = tableToExtractedData(block);

    expect(data.rows[0].QTY).toBe('');
    expect(data.rows[0]._cellConfidence.QTY).toBe(0.6);
    expect(data.rows[0]._cellKeyMap?.QTY).toBeUndefined(); // never grounded: there was no cell
  });

  it('hierarchyColumnKey: null forces a flat table even when rows carry levels', () => {
    const block = table({
      id: 't1',
      columns: [{ key: 'ITEM', label: 'Item' }],
      itemColumnKey: 'ITEM',
      rows: [row('r0', 0, { ITEM: cell('Parent') }), row('r1', 1, { ITEM: cell('Child') })],
    });

    const data = tableToExtractedData(block, { hierarchyColumnKey: null });

    expect(data.columns).toEqual(['ITEM']); // no SUB_ columns
    expect(data.rows.map((r) => r._indentLevel)).toEqual([0, 0]);
  });

  it('manualIndentLevels overrides each row\'s detected level', () => {
    const block = table({
      id: 't1',
      columns: [{ key: 'ITEM', label: 'Item' }],
      itemColumnKey: 'ITEM',
      rows: [row('r0', 0, { ITEM: cell('A') }), row('r1', 0, { ITEM: cell('B') })],
    });

    const data = tableToExtractedData(block, { manualIndentLevels: { r1: 1 } });

    expect(data.rows.map((r) => r._indentLevel)).toEqual([0, 1]);
  });

  it('switches the hierarchy column when hierarchyColumnKey names a different existing column', () => {
    const block = table({
      id: 't1',
      columns: [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }],
      itemColumnKey: 'A',
      rows: [row('r1', 0, { A: cell('a1'), B: cell('b1') })],
    });

    const data = tableToExtractedData(block, { hierarchyColumnKey: 'B' });
    expect(data.itemColumnKey).toBe('B');
  });
});

describe('pickPrimaryTable', () => {
  it('returns the table block with the most rows', () => {
    const small = table({ id: 'small', rows: [row('r1', 0, {})] });
    const big = table({ id: 'big', rows: [row('r1', 0, {}), row('r2', 0, {})] });
    expect(pickPrimaryTable([small, big])).toBe(big);
  });

  it('ignores non-table blocks and returns undefined when there are no tables', () => {
    const field: FieldBlock = { kind: 'field', id: 'f1', key: 'K', label: 'K', value: 'v', confidence: 1 };
    const text: TextBlock = { kind: 'text', id: 'x1', role: 'paragraph', text: 't', confidence: 1 };
    expect(pickPrimaryTable([field, text])).toBeUndefined();
  });
});

describe('pageToExtractedPage', () => {
  it('fills the top-level grid from the primary table and parks the rest in otherTables', () => {
    const small = table({
      id: 'small',
      columns: [{ key: 'X', label: 'X' }],
      itemColumnKey: 'X',
      rows: [row('r1', 0, { X: cell('one') })],
    });
    const big = table({
      id: 'big',
      columns: [{ key: 'ITEM', label: 'Item' }],
      itemColumnKey: 'ITEM',
      rows: [row('r1', 0, { ITEM: cell('a') }), row('r2', 0, { ITEM: cell('b') })],
    });
    const field: FieldBlock = { kind: 'field', id: 'f1', key: 'TOTAL', label: 'Total', value: '$5', confidence: 1 };
    const text: TextBlock = { kind: 'text', id: 'x1', role: 'footer', text: 'Page 1', confidence: 1 };

    const page = pageToExtractedPage({ pageIndex: 2, blocks: [small, big, field, text] as Block[] });

    expect(page.pageIndex).toBe(2);
    expect(page.tableId).toBe('big'); // most rows wins
    expect(page.columns).toEqual(['ITEM']);
    expect(page.tableOrder).toEqual(['small', 'big']); // document order, not size order
    expect(page.otherTables).toHaveLength(1);
    expect(page.otherTables?.[0].tableId).toBe('small');
    expect(page.fields).toEqual([{ id: 'f1', key: 'TOTAL', label: 'Total', value: '$5', confidence: 1 }]);
    expect(page.texts).toEqual([{ id: 'x1', role: 'footer', text: 'Page 1', confidence: 1 }]);
  });

  it('returns an empty grid (but keeps pageIndex) when the page has no table', () => {
    const page = pageToExtractedPage({ pageIndex: 5, blocks: [] });

    expect(page.pageIndex).toBe(5);
    expect(page.tableId).toBeUndefined();
    expect(page.columns).toEqual([]);
    expect(page.rows).toEqual([]);
    expect(page.tableOrder).toEqual([]);
    expect(page.otherTables).toEqual([]);
  });
});

describe('switchActiveTable', () => {
  const basePage: ExtractedPage = {
    pageIndex: 0,
    tableId: 'active',
    columns: ['A'],
    itemColumnKey: 'A',
    rows: [{ _id: 'r1', _cellConfidence: {}, A: 'active-value' }],
    otherTables: [
      { tableId: 'parked', columns: ['B'], itemColumnKey: 'B', rows: [{ _id: 'r2', _cellConfidence: {}, B: 'parked-value' }] },
    ],
  };

  it('swaps the parked table into the top-level grid and parks the previously-active one', () => {
    const next = switchActiveTable(basePage, 'parked');

    expect(next.tableId).toBe('parked');
    expect(next.columns).toEqual(['B']);
    expect(next.rows[0].B).toBe('parked-value');
    expect(next.otherTables).toHaveLength(1);
    expect(next.otherTables?.[0]).toMatchObject({ tableId: 'active', columns: ['A'] });
  });

  it('is a no-op when asked to switch to the table that is already active', () => {
    expect(switchActiveTable(basePage, 'active')).toBe(basePage);
  });

  it('is a no-op for an unknown tableId', () => {
    expect(switchActiveTable(basePage, 'nope')).toBe(basePage);
  });

  it('is a no-op when the page has no active table at all', () => {
    const noTable: ExtractedPage = { pageIndex: 0, columns: [], itemColumnKey: '', rows: [] };
    expect(switchActiveTable(noTable, 'anything')).toBe(noTable);
  });
});

describe('listTables', () => {
  it('returns [] when the page has no active table', () => {
    expect(listTables({ pageIndex: 0, columns: [], itemColumnKey: '', rows: [] })).toEqual([]);
  });

  it('lists tabs in tableOrder, labeling them positionally and reading row counts from the right source', () => {
    const page: ExtractedPage = {
      pageIndex: 0,
      tableId: 't2',
      tableOrder: ['t1', 't2'],
      columns: ['ITEM'],
      itemColumnKey: 'ITEM',
      rows: [{ _id: 'r1', _cellConfidence: {} }, { _id: 'r2', _cellConfidence: {} }], // active grid: 2 rows
      otherTables: [{ tableId: 't1', columns: [], itemColumnKey: '', rows: [{ _id: 'r3', _cellConfidence: {} }] }], // parked: 1 row
    };

    expect(listTables(page)).toEqual([
      { id: 't1', label: 'Table 1', rowCount: 1 },
      { id: 't2', label: 'Table 2', rowCount: 2 },
    ]);
  });

  it('drops ids from tableOrder that are not actually present', () => {
    const page: ExtractedPage = {
      pageIndex: 0,
      tableId: 't1',
      tableOrder: ['t1', 'ghost'],
      columns: [],
      itemColumnKey: '',
      rows: [],
    };
    expect(listTables(page).map((t) => t.id)).toEqual(['t1']);
  });
});
