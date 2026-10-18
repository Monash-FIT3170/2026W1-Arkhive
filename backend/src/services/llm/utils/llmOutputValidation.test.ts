import { describe, it, expect } from 'vitest';
import { sanitizeFormatRegex, sanitizeIntent } from './llmOutputValidation';

const context = {
  columns: ['ITEM', 'QTY', 'PRICE'],
  itemColumnKey: 'ITEM',
  rows: [
    { _id: 'row_1', ITEM: 'Apple', QTY: '1', PRICE: '10.00', _cellConfidence: {} },
    { _id: 'row_2', ITEM: 'Banana', QTY: '5', PRICE: '2.50', _cellConfidence: {} },
  ],
};

describe('sanitizeIntent', () => {
  it('passes through intents that do not change the table', () => {
    const intent = { type: 'approval' };
    expect(sanitizeIntent(context, intent)).toEqual({ intent, dropped: 0, rejected: false });
    expect(sanitizeIntent(context, null).intent).toBeNull();
  });

  it('rejects a table change when there is no table to check it against', () => {
    const result = sanitizeIntent(undefined, {
      type: 'correction',
      rowId: 'row_1',
      column: 'PRICE',
      newValue: '1',
    });
    expect(result.rejected).toBe(true);
    expect(result.intent).toEqual({ type: 'unclear' });
  });

  describe('correction', () => {
    it('keeps a correction for a real row and column', () => {
      const result = sanitizeIntent(context, {
        type: 'correction',
        rowId: 'row_1',
        column: 'PRICE',
        newValue: '12.00',
      });
      expect(result.rejected).toBe(false);
      expect(result.intent.newValue).toBe('12.00');
    });

    it('rejects a row id or column that is not in the table', () => {
      expect(
        sanitizeIntent(context, { type: 'correction', rowId: 'row_99', column: 'PRICE', newValue: '1' })
          .rejected
      ).toBe(true);
      expect(
        sanitizeIntent(context, { type: 'correction', rowId: 'row_1', column: 'SECRET', newValue: '1' })
          .rejected
      ).toBe(true);
      expect(
        sanitizeIntent(context, { type: 'correction', rowId: 'row_1', column: '__proto__', newValue: '1' })
          .rejected
      ).toBe(true);
    });

    it('rejects values that are not text or are far too long', () => {
      const base = { type: 'correction', rowId: 'row_1', column: 'PRICE' };
      expect(sanitizeIntent(context, { ...base, newValue: { evil: true } }).rejected).toBe(true);
      expect(sanitizeIntent(context, { ...base, newValue: 'x'.repeat(501) }).rejected).toBe(true);
    });

    it('drops list fields a correction should not carry', () => {
      const result = sanitizeIntent(context, {
        type: 'correction',
        rowId: 'row_1',
        column: 'PRICE',
        newValue: '1',
        deletedColumns: ['ITEM'],
      });
      expect(result.intent.deletedColumns).toBeUndefined();
    });

    it('enforces limits for a single-cell review', () => {
      const limits = { expectedType: 'correction', column: 'QTY', rowIds: ['row_1'] };
      const ok = { type: 'correction', rowId: 'row_1', column: 'QTY', newValue: '3' };
      expect(sanitizeIntent(context, ok, limits).rejected).toBe(false);
      expect(sanitizeIntent(context, { ...ok, rowId: 'row_2' }, limits).rejected).toBe(true);
      expect(sanitizeIntent(context, { ...ok, column: 'PRICE' }, limits).rejected).toBe(true);
      expect(
        sanitizeIntent(context, { type: 'column_delete', deletedColumns: ['QTY'] }, limits).rejected
      ).toBe(true);
    });
  });

  describe('bulk_update', () => {
    it('keeps valid cells and counts the ones it drops', () => {
      const result = sanitizeIntent(context, {
        type: 'bulk_update',
        bulkUpdates: [
          { rowId: 'row_1', column: 'PRICE', newValue: '$10.00' },
          { rowId: 'row_2', column: 'PRICE', newValue: '$2.50' },
          { rowId: 'row_99', column: 'PRICE', newValue: '$0' },
          { rowId: 'row_1', column: 'NOPE', newValue: '$0' },
        ],
      });
      expect(result.rejected).toBe(false);
      expect(result.intent.bulkUpdates).toHaveLength(2);
      expect(result.dropped).toBe(2);
    });

    it('rejects when nothing valid is left', () => {
      const result = sanitizeIntent(context, {
        type: 'bulk_update',
        bulkUpdates: [{ rowId: 'row_99', column: 'PRICE', newValue: '1' }],
      });
      expect(result.rejected).toBe(true);
    });

    it('only touches the flagged rows and column in a bulk review', () => {
      const limits = { expectedType: 'bulk_update', column: 'PRICE', rowIds: ['row_1'] };
      const result = sanitizeIntent(
        context,
        {
          type: 'bulk_update',
          bulkUpdates: [
            { rowId: 'row_1', column: 'PRICE', newValue: '10' },
            { rowId: 'row_2', column: 'PRICE', newValue: '0' },
            { rowId: 'row_1', column: 'QTY', newValue: '0' },
          ],
        },
        limits
      );
      expect(result.intent.bulkUpdates).toEqual([{ rowId: 'row_1', column: 'PRICE', newValue: '10' }]);
    });
  });

  describe('column_correction', () => {
    it('keeps a rename of a real column to a safe new name', () => {
      const result = sanitizeIntent(context, {
        type: 'column_correction',
        updates: [{ from: 'PRICE', to: ' Cost ' }],
      });
      expect(result.intent.updates).toEqual([{ from: 'PRICE', to: 'Cost' }]);
    });

    it('rejects renames of missing columns or onto an existing column', () => {
      expect(
        sanitizeIntent(context, { type: 'column_correction', updates: [{ from: 'NOPE', to: 'X' }] })
          .rejected
      ).toBe(true);
      expect(
        sanitizeIntent(context, { type: 'column_correction', updates: [{ from: 'PRICE', to: 'QTY' }] })
          .rejected
      ).toBe(true);
    });

    it('rejects names that look like internal fields', () => {
      for (const to of ['_id', '__proto__', 'constructor', '']) {
        expect(
          sanitizeIntent(context, { type: 'column_correction', updates: [{ from: 'PRICE', to }] })
            .rejected
        ).toBe(true);
      }
    });
  });

  describe('column_delete', () => {
    it('keeps only columns that exist', () => {
      const result = sanitizeIntent(context, {
        type: 'column_delete',
        deletedColumns: ['QTY', 'NOPE'],
      });
      expect(result.intent.deletedColumns).toEqual(['QTY']);
      expect(result.dropped).toBe(1);
    });

    it('refuses to delete every column', () => {
      const result = sanitizeIntent(context, {
        type: 'column_delete',
        deletedColumns: ['ITEM', 'QTY', 'PRICE'],
      });
      expect(result.rejected).toBe(true);
    });
  });
});

describe('sanitizeFormatRegex', () => {
  it('keeps normal patterns', () => {
    expect(sanitizeFormatRegex('^\\d+$')).toBe('^\\d+$');
    expect(sanitizeFormatRegex('^[\\w\\s.,/-]+$')).toBe('^[\\w\\s.,/-]+$');
    expect(sanitizeFormatRegex('^\\[(CRITICAL|NORMAL|WARNING)\\]\\s+.*$')).not.toBeNull();
  });

  it('rejects patterns that do not compile, are too long, or can hang the browser', () => {
    expect(sanitizeFormatRegex('^(unclosed')).toBeNull();
    expect(sanitizeFormatRegex('a'.repeat(201))).toBeNull();
    expect(sanitizeFormatRegex('^(a+)+$')).toBeNull();
    expect(sanitizeFormatRegex('')).toBeNull();
    expect(sanitizeFormatRegex(42)).toBeNull();
  });
});
