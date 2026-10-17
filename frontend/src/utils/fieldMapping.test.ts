import { describe, it, expect } from 'vitest';
import type { ExtractedPage } from '../models/TableData';
import {
  applyFieldMapping,
  findUnmatchedRules,
  normalizeFieldName,
  validateFieldMapping,
  type FieldMapping,
} from './fieldMapping';

function makePage(): ExtractedPage {
  return {
    pageIndex: 3,
    itemColumnKey: 'ITEM',
    columns: ['ITEM', 'QTY', 'PRICE', 'TOTAL'],
    rows: [
      {
        _id: 'comp_1',
        _confidence: 0.9,
        _indentLevel: 0,
        _cellConfidence: { ITEM: 0.95, QTY: 0.9, PRICE: 0.8, TOTAL: 0.85 },
        _cellKeyMap: { ITEM: 'cell_0', QTY: 'cell_1', PRICE: 'cell_2', TOTAL: 'cell_3' },
        ITEM: 'Notebook A5',
        QTY: '2',
        PRICE: '$4.50',
        TOTAL: '$9.00',
      },
      {
        _id: 'comp_2',
        _cellConfidence: { ITEM: 0.9 },
        ITEM: 'Blue Pen',
        QTY: '5',
        PRICE: '$1.20',
        TOTAL: '$6.00',
      },
    ],
  };
}

function invoiceMapping(overrides: Partial<FieldMapping> = {}): FieldMapping {
  return {
    documentType: 'invoice',
    rules: [
      { from: 'ITEM', to: 'Description' },
      { from: 'PRICE', to: 'Unit Price' },
    ],
    ...overrides,
  };
}

describe('normalizeFieldName', () => {
  it('ignores case, underscores, spaces and punctuation', () => {
    expect(normalizeFieldName('PRICE_LIST')).toBe('price list');
    expect(normalizeFieldName('  Price   List ')).toBe('price list');
    expect(normalizeFieldName('price-list')).toBe('price list');
  });

  it('keeps letters and digits from other scripts', () => {
    expect(normalizeFieldName('Prix_unitaire')).toBe('prix unitaire');
    expect(normalizeFieldName('\u6570\u91cf')).toBe('\u6570\u91cf');
  });
});

describe('applyFieldMapping', () => {
  it('renames mapped columns in both the column list and every row', () => {
    const result = applyFieldMapping(makePage(), invoiceMapping());
    expect(result.columns).toEqual(['Description', 'Unit Price', 'QTY', 'TOTAL']);
    expect(result.rows[0].Description).toBe('Notebook A5');
    expect(result.rows[0]['Unit Price']).toBe('$4.50');
    expect(result.rows[0].ITEM).toBeUndefined();
    expect(result.rows[0].PRICE).toBeUndefined();
    expect(result.rows[1]['Unit Price']).toBe('$1.20');
  });

  it('puts mapped columns first, in rule order, then keeps unmapped columns in original order', () => {
    const mapping = invoiceMapping({
      rules: [
        { from: 'TOTAL', to: 'Amount' },
        { from: 'ITEM', to: 'Description' },
      ],
    });
    expect(applyFieldMapping(makePage(), mapping).columns).toEqual([
      'Amount',
      'Description',
      'QTY',
      'PRICE',
    ]);
  });

  it('drops unmapped columns when unmapped is "drop"', () => {
    const result = applyFieldMapping(makePage(), invoiceMapping({ unmapped: 'drop' }));
    expect(result.columns).toEqual(['Description', 'Unit Price']);
    expect(result.rows[0].QTY).toBeUndefined();
    expect(result.rows[0].TOTAL).toBeUndefined();
    expect(result.rows[0]._cellConfidence).toEqual({ Description: 0.95, 'Unit Price': 0.8 });
  });

  it('matches source names ignoring case and separators', () => {
    const page = makePage();
    page.columns = ['ITEM', 'PRICE_LIST_WHITE'];
    page.rows = [{ _id: 1, _cellConfidence: {}, ITEM: 'Toilet', PRICE_LIST_WHITE: '38,230,000' }];
    const mapping = invoiceMapping({ rules: [{ from: 'price list white', to: 'Price' }] });
    const result = applyFieldMapping(page, mapping);
    expect(result.columns).toEqual(['Price', 'ITEM']);
    expect(result.rows[0].Price).toBe('38,230,000');
  });

  it('skips rules that match no column instead of failing', () => {
    const mapping = invoiceMapping({
      rules: [
        { from: 'TAX', to: 'GST' },
        { from: 'ITEM', to: 'Description' },
      ],
    });
    const result = applyFieldMapping(makePage(), mapping);
    expect(result.columns).toEqual(['Description', 'QTY', 'PRICE', 'TOTAL']);
    expect(findUnmatchedRules(makePage(), mapping)).toEqual([{ from: 'TAX', to: 'GST' }]);
  });

  it('can swap two column names without losing data', () => {
    const mapping = invoiceMapping({
      rules: [
        { from: 'PRICE', to: 'TOTAL' },
        { from: 'TOTAL', to: 'PRICE' },
      ],
    });
    const result = applyFieldMapping(makePage(), mapping);
    expect(result.columns).toEqual(['TOTAL', 'PRICE', 'ITEM', 'QTY']);
    expect(result.rows[0].TOTAL).toBe('$4.50');
    expect(result.rows[0].PRICE).toBe('$9.00');
  });

  it('throws if a renamed column would collide with a kept column', () => {
    const mapping = invoiceMapping({ rules: [{ from: 'ITEM', to: 'QTY' }] });
    expect(() => applyFieldMapping(makePage(), mapping)).toThrow(/two columns named "QTY"/);
  });

  it('does not collide when the clashing column is dropped', () => {
    const mapping = invoiceMapping({ rules: [{ from: 'ITEM', to: 'QTY' }], unmapped: 'drop' });
    expect(applyFieldMapping(makePage(), mapping).columns).toEqual(['QTY']);
  });

  it('throws on an invalid mapping', () => {
    const mapping = invoiceMapping({
      rules: [
        { from: 'ITEM', to: 'Name' },
        { from: 'PRICE', to: 'Name' },
      ],
    });
    expect(() => applyFieldMapping(makePage(), mapping)).toThrow(/used more than once/);
  });

  it('never modifies the data it is given', () => {
    const page = makePage();
    const before = JSON.stringify(page);
    applyFieldMapping(page, invoiceMapping({ unmapped: 'drop' }));
    expect(JSON.stringify(page)).toBe(before);
  });

  it('keeps row metadata and extra page fields', () => {
    const result = applyFieldMapping(makePage(), invoiceMapping());
    expect(result.pageIndex).toBe(3);
    expect(result.rows[0]._id).toBe('comp_1');
    expect(result.rows[0]._confidence).toBe(0.9);
    expect(result.rows[0]._indentLevel).toBe(0);
  });

  it('re-keys per-column confidence and cell keys to the new names', () => {
    const result = applyFieldMapping(makePage(), invoiceMapping());
    expect(result.rows[0]._cellConfidence).toEqual({
      Description: 0.95,
      'Unit Price': 0.8,
      QTY: 0.9,
      TOTAL: 0.85,
    });
    expect(result.rows[0]._cellKeyMap).toEqual({
      Description: 'cell_0',
      'Unit Price': 'cell_2',
      QTY: 'cell_1',
      TOTAL: 'cell_3',
    });
    expect(result.rows[1]._cellKeyMap).toBeUndefined();
  });

  it('follows the item column when it is renamed, and clears it when dropped', () => {
    expect(applyFieldMapping(makePage(), invoiceMapping()).itemColumnKey).toBe('Description');
    const dropped = invoiceMapping({ rules: [{ from: 'PRICE', to: 'Cost' }], unmapped: 'drop' });
    expect(applyFieldMapping(makePage(), dropped).itemColumnKey).toBe('');
  });

  it('with no rules and unmapped "keep" returns identical columns and values', () => {
    const page = makePage();
    const result = applyFieldMapping(page, invoiceMapping({ rules: [] }));
    expect(result.columns).toEqual(page.columns);
    expect(result.rows[0].ITEM).toBe('Notebook A5');
  });

  it('works on empty data', () => {
    const empty = { columns: [], rows: [], itemColumnKey: '' };
    expect(applyFieldMapping(empty, invoiceMapping())).toEqual(empty);
  });
});

describe('validateFieldMapping', () => {
  it('returns no problems for a good mapping', () => {
    expect(validateFieldMapping(invoiceMapping())).toEqual([]);
  });

  it('reports empty names and duplicates', () => {
    const problems = validateFieldMapping(
      invoiceMapping({
        rules: [
          { from: '  ', to: 'A' },
          { from: 'ITEM', to: ' ' },
          { from: 'item', to: 'B' },
          { from: 'X', to: 'B' },
        ],
      })
    );
    expect(problems).toHaveLength(4);
    expect(problems.join(' ')).toMatch(/source column name is empty/);
    expect(problems.join(' ')).toMatch(/target column name is empty/);
    expect(problems.join(' ')).toMatch(/mapped more than once/);
    expect(problems.join(' ')).toMatch(/used more than once/);
  });
});
