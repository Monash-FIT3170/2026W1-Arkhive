import { describe, it, expect } from 'vitest';
// Adjust this import path to wherever detectFormat.ts actually lives relative to this test file.
import { checkColumnFormat, checkTableFormats, type ColumnRegexMap } from './detectFormat';
import type { ExtractedData, ExtractedRow } from '../../../../models/TableData';

// Acknowledgment: The generation of these tests was done with the
// assistance of Google Gemini

/**
 * Builds a row, filling in the required metadata fields (_cellConfidence) with sane
 * defaults so test fixtures don't have to repeat that boilerplate everywhere.
 */
function row(partial: { _id: string | number; [key: string]: any }): ExtractedRow {
  return { _cellConfidence: {}, ...partial };
}

/** Small helper to avoid repeating `{ columns, rows }` boilerplate in every test. */
function makeData(rows: ExtractedRow[]): ExtractedData {
  const columns = rows.length > 0 ? Object.keys(rows[0]).filter((k) => !k.startsWith('_')) : [];
  return { columns, rows, itemColumnKey: columns[0] ?? '' };
}

describe('checkColumnFormat', () => {
  //Check when data passes
  it('does not flag values that match the format', () => {
    const data = makeData([
      row({ _id: 1, dueDate: '2024-01-01' }),
      row({ _id: 2, dueDate: '2024-12-31' }),
    ]);
    const result = checkColumnFormat(data, 'dueDate', '\\d{4}-\\d{2}-\\d{2}');
    expect(result).toEqual([]);
  });

  // Check when data does not pass
  it('flags values that do not match the format', () => {
    const data = makeData([
      row({ _id: 1, dueDate: '2024-01-01' }),
      row({ _id: 2, dueDate: 'not-a-date' }),
    ]);
    const result = checkColumnFormat(data, 'dueDate', '\\d{4}-\\d{2}-\\d{2}');
    expect(result).toEqual([{ rowId: 2, column: 'dueDate', value: 'not-a-date' }]);
  });

  //  Check that it can handle undefined, empty as well
  it('flags null, undefined, and empty-string values for regular columns', () => {
    const data = makeData([
      row({ _id: 1, phone: null }),
      row({ _id: 2, phone: undefined }),
      row({ _id: 3, phone: '' }),
      row({ _id: 4, phone: '   ' }), // whitespace-only counts as empty
    ]);
    const result = checkColumnFormat(data, 'phone', '\\(\\d{3}\\) \\d{3}-\\d{4}');
    expect(result).toHaveLength(4);
    expect(result.map((r) => r.rowId)).toEqual([1, 2, 3, 4]);
  });

  // Check that it can handle when row have different formats
  it('flags a missing property (column absent from the row) as empty', () => {
    const data = makeData([row({ _id: 1 })]);
    const result = checkColumnFormat(data, 'phone', '\\d+');
    expect(result).toEqual([{ rowId: 1, column: 'phone', value: undefined }]);
  });

  // Check when value does not match it keep original value
  it('preserves the original (untrimmed, unconverted) value on a flagged cell', () => {
    const data = makeData([row({ _id: 1, dueDate: '  2024/01/01  ' })]);
    const result = checkColumnFormat(data, 'dueDate', '\\d{4}-\\d{2}-\\d{2}');
    // The regex test runs on the trimmed string, but the reported value should be the raw cell value.
    expect(result).toEqual([{ rowId: 1, column: 'dueDate', value: '  2024/01/01  ' }]);
  });

  // Check it accepts when value has been that has padding
  it('trims whitespace before testing so a valid, padded value is not flagged', () => {
    const data = makeData([row({ _id: 1, dueDate: '  2024-01-01  ' })]);
    const result = checkColumnFormat(data, 'dueDate', '\\d{4}-\\d{2}-\\d{2}');
    expect(result).toEqual([]);
  });

  // Check it can handle non-string values
  it('stringifies non-string values before testing', () => {
    const data = makeData([row({ _id: 1, year: 2024 })]);
    const result = checkColumnFormat(data, 'year', '\\d{4}');
    expect(result).toEqual([]);
  });

  // Check it can handle boolean values
  it('does not treat falsy-but-present values (0, false) as empty', () => {
    const qtyData = makeData([row({ _id: 1, qty: 0 })]);
    const activeData = makeData([row({ _id: 2, active: false })]);
    expect(checkColumnFormat(qtyData, 'qty', '\\d+')).toEqual([]);
    expect(checkColumnFormat(activeData, 'active', 'false')).toEqual([]);
  });

  // Check it it reject is not the entire string matchs regex
  it('anchors the regex so partial/substring matches are rejected', () => {
    const data = makeData([row({ _id: 1, code: 'abc123abc' })]);
    // '\d+' alone would match a substring; toRegex should force a full match via ^...$.
    const result = checkColumnFormat(data, 'code', '\\d+');
    expect(result).toEqual([{ rowId: 1, column: 'code', value: 'abc123abc' }]);
  });

  // Check toRegex properly added the ^ or $ symbol
  it('does not double up anchors when the format source already has ^ and/or $', () => {
    const data = makeData([row({ _id: 1, code: '123' }), row({ _id: 2, code: '1234' })]);
    const bothAnchors = checkColumnFormat(data, 'code', '^\\d{3}$');
    const leadingOnly = checkColumnFormat(data, 'code', '^\\d{3}');
    const trailingOnly = checkColumnFormat(data, 'code', '\\d{3}$');
    // All three variants should behave identically: only the 4-digit row is flagged.
    for (const result of [bothAnchors, leadingOnly, trailingOnly]) {
      expect(result).toEqual([{ rowId: 2, column: 'code', value: '1234' }]);
    }
  });

  // Make sure it only sepects the required column
  it('only inspects the requested column, ignoring other columns on the row', () => {
    const data = makeData([row({ _id: 1, dueDate: '2024-01-01', phone: 'garbage' })]);
    const result = checkColumnFormat(data, 'dueDate', '\\d{4}-\\d{2}-\\d{2}');
    expect(result).toEqual([]);
  });

  // check it returns detected in correct order
  it('returns results in row order', () => {
    const data = makeData([
      row({ _id: 'a', dueDate: 'bad' }),
      row({ _id: 'b', dueDate: '2024-01-01' }),
      row({ _id: 'c', dueDate: 'also-bad' }),
    ]);
    const result = checkColumnFormat(data, 'dueDate', '\\d{4}-\\d{2}-\\d{2}');
    expect(result.map((r) => r.rowId)).toEqual(['a', 'c']);
  });

  // Check it can handle when input is empty
  it('returns an empty array when there are no rows', () => {
    const data = makeData([]);
    expect(checkColumnFormat(data, 'dueDate', '\\d{4}-\\d{2}-\\d{2}')).toEqual([]);
  });

  // Check it ignore the other row fields
  it('ignores row metadata fields (_cellKeyMap, _confidence, _cellConfidence) entirely', () => {
    const data = makeData([
      row({
        _id: 1,
        dueDate: '2024-01-01',
        _cellKeyMap: { dueDate: 'due_date_raw' },
        _confidence: 0.42,
        _cellConfidence: { dueDate: 0.9 },
      }),
    ]);
    const result = checkColumnFormat(data, 'dueDate', '\\d{4}-\\d{2}-\\d{2}');
    expect(result).toEqual([]);
  });

  // Check that it doesn't flag sub-rows is they are empty (empty can be due to flattening)
  describe('sub-item (SUB_<COL>_<depth>) columns', () => {
    it('does not flag an empty value on a SUB_..._<n> column', () => {
      const data = makeData([row({ _id: 1, SUB_ITEM_1: '' })]);
      const result = checkColumnFormat(data, 'SUB_ITEM_1', '\\d+');
      expect(result).toEqual([]);
    });

    // Check that it doesn't flag sub-rows is they are unedfined (empty can be due to flattening)
    it('does not flag null/undefined on a SUB_..._<n> column either', () => {
      const data = makeData([
        row({ _id: 1, SUB_ITEM_1: null }),
        row({ _id: 2, SUB_ITEM_1: undefined }),
      ]);
      const result = checkColumnFormat(data, 'SUB_ITEM_1', '\\d+');
      expect(result).toEqual([]);
    });

    // Check it can still flag sub-columns for values that is non empty
    it('still flags a non-empty value on a SUB_..._<n> column that fails the format', () => {
      const data = makeData([row({ _id: 1, SUB_ITEM_1: 'not-a-number' })]);
      const result = checkColumnFormat(data, 'SUB_ITEM_1', '\\d+');
      expect(result).toEqual([{ rowId: 1, column: 'SUB_ITEM_1', value: 'not-a-number' }]);
    });

    // Check it can only skips mepty is the sub-column is the correct column naming type
    it('does not treat a column missing the depth suffix as a sub-item column', () => {
      // No trailing _<digits> -> isSubItemColumn should return false -> empty gets flagged.
      const data = makeData([row({ _id: 1, SUB_ITEM: '' })]);
      const result = checkColumnFormat(data, 'SUB_ITEM', '\\d+');
      expect(result).toEqual([{ rowId: 1, column: 'SUB_ITEM', value: '' }]);
    });

    // Check it can only skips mepty is the sub-column is the correct column naming type
    it('does not treat a non-numeric suffix as a sub-item column', () => {
      const data = makeData([row({ _id: 1, SUB_ITEM_abc: '' })]);
      const result = checkColumnFormat(data, 'SUB_ITEM_abc', '\\d+');
      expect(result).toEqual([{ rowId: 1, column: 'SUB_ITEM_abc', value: '' }]);
    });

    // Check it can only skips mepty is the sub-column is the correct column naming type
    it('does not treat a column merely containing "SUB_" mid-name as structural', () => {
      // Must start with SUB_ to match; "PREFIX_SUB_ITEM_1" should not qualify.
      const data = makeData([row({ _id: 1, PREFIX_SUB_ITEM_1: '' })]);
      const result = checkColumnFormat(data, 'PREFIX_SUB_ITEM_1', '\\d+');
      expect(result).toEqual([{ rowId: 1, column: 'PREFIX_SUB_ITEM_1', value: '' }]);
    });
  });
});

describe('checkTableFormats', () => {
  // Check if checkTableFormats can handle good inputs
  it('aggregates flagged cells across every column in the format map', () => {
    const data = makeData([
      row({ _id: 1, dueDate: '2024-01-01', phone: '(555) 123-4567' }),
      row({ _id: 2, dueDate: 'bad-date', phone: '5551234567' }),
    ]);
    const formatMap: ColumnRegexMap = {
      dueDate: '\\d{4}-\\d{2}-\\d{2}',
      phone: '\\(\\d{3}\\) \\d{3}-\\d{4}',
    };
    const result = checkTableFormats(data, formatMap);
    expect(result).toEqual([
      { rowId: 2, column: 'dueDate', value: 'bad-date' },
      { rowId: 2, column: 'phone', value: '5551234567' },
    ]);
  });

  // Check if checkTableformats can return in correct order
  it('returns results grouped by column (formatMap order), then row order within each column', () => {
    const data = makeData([row({ _id: 1, a: 'x', b: 'x' }), row({ _id: 2, a: 'x', b: 'x' })]);
    // Both columns fail for both rows; result should read column "a" (all rows) then column "b" (all rows).
    const formatMap: ColumnRegexMap = { a: '\\d+', b: '\\d+' };
    const result = checkTableFormats(data, formatMap);
    expect(result.map((r) => `${r.column}:${r.rowId}`)).toEqual(['a:1', 'a:2', 'b:1', 'b:2']);
  });

  // Check if checkTableformats can handle empty ColumnRegexMap
  it('returns an empty array when the format map is empty', () => {
    const data = makeData([row({ _id: 1, dueDate: '2024-01-01' })]);
    expect(checkTableFormats(data, {})).toEqual([]);
  });

  // Check if checkTableformats can handle empty data
  it('returns an empty array when there are no rows, regardless of the format map', () => {
    const data = makeData([]);
    const formatMap: ColumnRegexMap = { dueDate: '\\d{4}-\\d{2}-\\d{2}' };
    expect(checkTableFormats(data, formatMap)).toEqual([]);
  });

  // Check if checkTableformats handle when every matches formatMap
  it('produces no flags when every column matches its format', () => {
    const data = makeData([row({ _id: 1, dueDate: '2024-01-01', phone: '(555) 123-4567' })]);
    const formatMap: ColumnRegexMap = {
      dueDate: '\\d{4}-\\d{2}-\\d{2}',
      phone: '\\(\\d{3}\\) \\d{3}-\\d{4}',
    };
    expect(checkTableFormats(data, formatMap)).toEqual([]);
  });
});
