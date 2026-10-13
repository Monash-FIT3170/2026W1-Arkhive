import { describe, it, expect } from 'vitest';
import { parseNumbering, detectNumberingLevels } from './numbering';

describe('parseNumbering', () => {
  it('parses simple and multi-level outline numbers', () => {
    expect(parseNumbering('1 Introduction')).toEqual([1]);
    expect(parseNumbering('1.2 Scope')).toEqual([1, 2]);
    expect(parseNumbering('1.2.3) Detail')).toEqual([1, 2, 3]);
    expect(parseNumbering('(3) Parenthesised')).toEqual([3]);
  });

  it('accepts a trailing dot or paren, or none at all', () => {
    expect(parseNumbering('2. Done')).toEqual([2]);
    expect(parseNumbering('2) Done')).toEqual([2]);
    expect(parseNumbering('2 Done')).toEqual([2]);
  });

  it('returns null for text with no leading number', () => {
    expect(parseNumbering('Introduction')).toBeNull();
    expect(parseNumbering('')).toBeNull();
  });

  it('parses a decimal-shaped value too (rejecting prices is detectNumberingLevels\' job, via consistency)', () => {
    // '5.00' is lexically indistinguishable from outline numbering "5.00"; parseNumbering
    // itself can't tell them apart, it just parses the digit groups.
    expect(parseNumbering('5.00')).toEqual([5, 0]);
    expect(parseNumbering('1.5')).toEqual([1, 5]);
  });

  it('does not match a 4+ digit group (dates, thousands)', () => {
    expect(parseNumbering('2024-01-01')).toBeNull();
    expect(parseNumbering('10,000 units')).toBeNull();
  });
});

describe('detectNumberingLevels', () => {
  it('detects an outline column and derives 0-based levels, carrying unnumbered rows forward', () => {
    const rows = [
      { ITEM: '1 Parent one' },
      { ITEM: '1.1 Child' },
      { ITEM: 'wrapped continuation text' }, // unnumbered: keeps previous level
      { ITEM: '1.2 Another child' },
      { ITEM: '2 Parent two' },
      { ITEM: '2.1 Child' },
    ];

    const result = detectNumberingLevels(rows, ['ITEM']);

    expect(result?.columnKey).toBe('ITEM');
    expect(result?.levels).toEqual([0, 1, 1, 1, 0, 1]);
  });

  it('returns null when no column looks like an outline', () => {
    const rows = [{ PRICE: '5.00' }, { PRICE: '12.50' }, { PRICE: '3.00' }];
    expect(detectNumberingLevels(rows, ['PRICE'])).toBeNull();
  });

  it('returns null when numbers are present but their parents never appear (inconsistent)', () => {
    // Every row is a deep number, but no "1", "2", "3" row ever precedes them.
    const rows = [
      { ITEM: '1.1 a' },
      { ITEM: '2.1 b' },
      { ITEM: '3.1 c' },
      { ITEM: '4.1 d' },
    ];
    expect(detectNumberingLevels(rows, ['ITEM'])).toBeNull();
  });

  it('returns null when coverage of the column is too low', () => {
    const rows = [
      { ITEM: '1 Parent' },
      { ITEM: '1.1 Child' },
      { ITEM: 'no number here' },
      { ITEM: 'also no number' },
      { ITEM: 'still no number' },
    ];
    expect(detectNumberingLevels(rows, ['ITEM'])).toBeNull();
  });

  it('picks the column with the most matches when several qualify', () => {
    const rows = [
      { ITEM: '1 Parent one', OTHER: '1 A' },
      { ITEM: '1.1 Child', OTHER: '1.1 B' },
      { ITEM: '1.2 Child', OTHER: 'no number' },
      { ITEM: '2 Parent two', OTHER: '2 C' },
    ];
    // Both columns qualify as outlines; ITEM matches on every row, OTHER on 3/4.
    const result = detectNumberingLevels(rows, ['OTHER', 'ITEM']);
    expect(result?.columnKey).toBe('ITEM');
  });

  it('respects custom minCoverage / minConsistency thresholds', () => {
    const rows = [
      { ITEM: '1 Parent' },
      { ITEM: '1.1 Child' },
      { ITEM: '1.2 Child' },
      { ITEM: 'unnumbered' },
      { ITEM: 'unnumbered' },
    ];
    // Coverage here is 3/5 = 0.6, under the default 0.7 threshold.
    expect(detectNumberingLevels(rows, ['ITEM'])).toBeNull();
    expect(detectNumberingLevels(rows, ['ITEM'], { minCoverage: 0.5 })?.columnKey).toBe('ITEM');
  });
});
