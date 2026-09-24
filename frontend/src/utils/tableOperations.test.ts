import { describe, it, expect } from 'vitest';
import type { ExtractedPage } from '../models/TableData';
import {
  renameColumn,
  getOverlayIdForField,
} from './tableOperations';

const createSamplePage = (): ExtractedPage => ({
  pageIndex: 0,
  columns: ['ITEM', 'QTY', 'PRICE'],
  itemColumnKey: 'ITEM',
  rows: [
    {
      _id: 'row_1',
      ITEM: 'Apples',
      QTY: '10',
      PRICE: '$5.00',
      _cellConfidence: { ITEM: 0.95, QTY: 0.9, PRICE: 0.85 },
      _cellKeyMap: { ITEM: 'box_1', QTY: 'box_2', PRICE: 'box_3' },
    },
    {
      _id: 'row_2',
      ITEM: 'Bananas',
      QTY: '20',
      PRICE: '$8.00',
      _cellConfidence: { ITEM: 0.99, QTY: 0.92, PRICE: 0.88 },
      _cellKeyMap: { ITEM: 'box_4', QTY: 'box_5', PRICE: 'box_6' },
    },
  ],
});

describe('tableOperations - renameColumn', () => {
  it('renames an existing column in columns array while preserving order', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'QTY', 'QUANTITY');

    expect(updated.columns).toEqual(['ITEM', 'QUANTITY', 'PRICE']);
  });

  it('updates row values to the new column key and removes the old column key', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'ITEM', 'DESCRIPTION');

    expect(updated.rows[0].DESCRIPTION).toBe('Apples');
    expect(updated.rows[0].ITEM).toBeUndefined();
    expect(updated.rows[1].DESCRIPTION).toBe('Bananas');
    expect(updated.rows[1].ITEM).toBeUndefined();
  });

  it('migrates _cellConfidence to the new column key', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'PRICE', 'UNIT_PRICE');

    expect(updated.rows[0]._cellConfidence.UNIT_PRICE).toBe(0.85);
    expect(updated.rows[0]._cellConfidence.PRICE).toBeUndefined();
    expect(updated.rows[1]._cellConfidence.UNIT_PRICE).toBe(0.88);
    expect(updated.rows[1]._cellConfidence.PRICE).toBeUndefined();
  });

  it('migrates _cellKeyMap overlay IDs to the new column key', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'ITEM', 'PRODUCT');

    expect(updated.rows[0]._cellKeyMap?.PRODUCT).toBe('box_1');
    expect(updated.rows[0]._cellKeyMap?.ITEM).toBeUndefined();
    expect(getOverlayIdForField(updated, 'row_1:PRODUCT')).toBe('box_1');
  });

  it('updates itemColumnKey if the renamed column was the itemColumnKey', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'ITEM', 'PRODUCT');

    expect(updated.itemColumnKey).toBe('PRODUCT');
  });

  it('leaves itemColumnKey unchanged if a different column is renamed', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'PRICE', 'AMOUNT');

    expect(updated.itemColumnKey).toBe('ITEM');
  });

  it('trims whitespace around the new column name', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'QTY', '  QUANTITY  ');

    expect(updated.columns).toEqual(['ITEM', 'QUANTITY', 'PRICE']);
    expect(updated.rows[0].QUANTITY).toBe('10');
  });

  it('returns data unchanged if oldName does not exist in columns', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'NON_EXISTENT', 'NEW_COL');

    expect(updated).toBe(page);
  });

  it('returns data unchanged if newName is empty or only whitespace', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'ITEM', '   ');

    expect(updated).toBe(page);
  });

  it('returns data unchanged if newName matches oldName', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'ITEM', 'ITEM');

    expect(updated).toBe(page);
  });

  it('returns data unchanged if newName already exists in columns (collision prevention)', () => {
    const page = createSamplePage();
    const updated = renameColumn(page, 'ITEM', 'PRICE');

    expect(updated).toBe(page);
  });
});
