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
  return { columns, rows, itemColumnKey: columns[0] ?? '' };
}

describe('detectReviewFields', () => {
  it('returns an empty array when there are no rows', () => {
    const data = buildData(['name', 'amount'], []);
    expect(detectReviewFields(data)).toEqual([]);
  });

  it('returns an empty array when no cells have confidence values', () => {
    const data = buildData(
      ['name', 'amount'],
      [buildRow({ _id: '1', name: 'Alice', amount: '10', _cellConfidence: {} })]
    );
    expect(detectReviewFields(data)).toEqual([]);
  });

  it('flags fields below the dynamic MAD outlier threshold', () => {
    // Confidences: 0.95, 0.96, 0.94, 0.40
    // Median = 0.945, MAD ≈ 0.0125. Dynamic threshold ≈ 0.92, bounded by HIGH_CONFIDENCE_PASS.
    // 0.40 falls well below the threshold.
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

  it('enforces the critical safety floor (0.60) on low-quality documents', () => {
    // Confidences: 0.50, 0.55, 0.60, 0.70
    // Median = 0.575. Dynamic threshold is ~0.45, but CRITICAL_FLOOR forces cutoff to 0.60.
    // Cells with confidence < 0.60 (0.50 and 0.55) are flagged.
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
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.confidence)).toEqual([0.5, 0.55]);
  });

  it('never flags cells with confidence above HIGH_CONFIDENCE_PASS (0.95)', () => {
    // Pristine document: 0.999, 0.999, 0.999, 0.960
    // Even though 0.960 is a statistical relative outlier, it exceeds 0.95 so it shouldn't be flagged.
    const data = buildData(
      ['name', 'amount'],
      [
        buildRow({
          _id: '1',
          name: 'Alice',
          amount: '10',
          _cellConfidence: { name: 0.999, amount: 0.999 },
        }),
        buildRow({
          _id: '2',
          name: 'Bob',
          amount: '20',
          _cellConfidence: { name: 0.999, amount: 0.96 },
        }),
      ]
    );

    expect(detectReviewFields(data)).toEqual([]);
  });

  it('skips cells with undefined confidence', () => {
    const data = buildData(
      ['name', 'amount'],
      [
        buildRow({
          _id: '1',
          name: 'Alice',
          amount: '10',
          _cellConfidence: { name: 0.95 },
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
          amount: 10, // Non-string
          _cellConfidence: { name: 0.95, amount: 0.1 },
        }),
      ]
    );

    const result = detectReviewFields(data);
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

  it('handles uniform confidence without false positives when MAD = 0', () => {
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
