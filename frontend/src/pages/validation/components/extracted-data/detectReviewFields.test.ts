import { describe, it, expect } from 'vitest';
import { detectReviewFields } from './detectReviewFields';
import type { ExtractedData, ExtractedRow } from '../../../../models/TableData';

function buildRow(overrides: Partial<ExtractedRow> & { _id: string | number }): ExtractedRow {
  return {
    _cellConfidence: {},
    ...overrides,
  };
}

function buildData(columns: string[], rows: ExtractedRow[]): ExtractedData {
  return { columns, rows };
}

describe('detectReviewFields', () => {
  //Empty rows
  it('returns an empty array when there are no rows', () => {
    const data = buildData(['name', 'amount'], []);
    expect(detectReviewFields(data)).toEqual([]);
  });

  //No confidence values
  it('returns an empty array when no cells have confidence values', () => {
    const data = buildData(
      ['name', 'amount'],
      [buildRow({ _id: '1', name: 'Alice', amount: '10', _cellConfidence: {} })]
    );
    expect(detectReviewFields(data)).toEqual([]);
  });

  //flags outlier below stddev threshold
  it('flags fields below the relative stddev threshold', () => {
    // confidences: 0.95, 0.96, 0.94, 0.4 -> 0.4 is a clear outlier
    const data = buildData(
      ['name', 'amount'],
      [
        buildRow({
          _id: '1',
          name: 'Alice',
          amount: '10',
          _cellConfidence: { name: 0.95, amount: 0.96 },
        }),
        buildRow({
          _id: '2',
          name: 'Bob',
          amount: '20',
          _cellConfidence: { name: 0.94, amount: 0.4 },
        }),
      ]
    );

    const result = detectReviewFields(data);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ rowId: '2', column: 'amount', value: '20', confidence: 0.4 });
  });

  // falls back to 85% confidence if under 85%
  it('uses the document quality floor when the mean confidence is low', () => {
    // all confidences below 0.85, so threshold pins at 0.85 instead of mean - 1.5*stddev
    const data = buildData(
      ['name', 'amount'],
      [
        buildRow({
          _id: '1',
          name: 'Alice',
          amount: '10',
          _cellConfidence: { name: 0.5, amount: 0.6 },
        }),
        buildRow({
          _id: '2',
          name: 'Bob',
          amount: '20',
          _cellConfidence: { name: 0.55, amount: 0.7 },
        }),
      ]
    );

    const result = detectReviewFields(data);
    // every value sits below the 0.85 floor, so every field should be flagged
    expect(result).toHaveLength(4);
  });

  it('skips cells with undefined confidence', () => {
    const data = buildData(
      ['name', 'amount'],
      [
        buildRow({
          _id: '1',
          name: 'Alice',
          amount: '10',
          _cellConfidence: { name: 0.95 }, // amount has no confidence entry
        }),
      ]
    );

    const result = detectReviewFields(data);
    expect(result.find((f) => f.column === 'amount')).toBeUndefined();
  });

  it('skips cells whose value is not a string', () => {
    const data = buildData(
      ['name', 'amount'],
      [
        buildRow({
          _id: '1',
          name: 'Alice',
          amount: 10, // number, not string
          _cellConfidence: { name: 0.95, amount: 0.1 },
        }),
      ]
    );

    const result = detectReviewFields(data);
    // amount confidence is low but the value isn't a string, so it must be skipped
    expect(result.find((f) => f.column === 'amount')).toBeUndefined();
  });

  it('sorts results by ascending confidence (lowest first)', () => {
    const data = buildData(
      ['name', 'amount'],
      [
        buildRow({
          _id: '1',
          name: 'Alice',
          amount: '10',
          _cellConfidence: { name: 0.3, amount: 0.1 },
        }),
        buildRow({
          _id: '2',
          name: 'Bob',
          amount: '20',
          _cellConfidence: { name: 0.2, amount: 0.35 },
        }),
      ]
    );

    const result = detectReviewFields(data);
    const confidences = result.map((f) => f.confidence);
    expect(confidences).toEqual([...confidences].sort((a, b) => a - b));
  });

  it('handles a single uniform confidence value without flagging anything (stddev = 0)', () => {
    const data = buildData(
      ['name', 'amount'],
      [
        buildRow({
          _id: '1',
          name: 'Alice',
          amount: '10',
          _cellConfidence: { name: 0.95, amount: 0.95 },
        }),
      ]
    );

    // mean = 0.95 (>= floor), stddev = 0, threshold = mean; nothing is strictly below it
    expect(detectReviewFields(data)).toEqual([]);
  });

  it('supports numeric rowIds', () => {
    const data = buildData(
      ['name'],
      [buildRow({ _id: 42, name: 'Alice', _cellConfidence: { name: 0.1 } })]
    );

    const result = detectReviewFields(data);
    expect(result[0].rowId).toBe(42);
  });
});
