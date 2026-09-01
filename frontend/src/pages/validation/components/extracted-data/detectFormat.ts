import type { ExtractedData } from '../../../../models/TableData';

/**
 * Map of column name -> format regex string (from the LLM step).
 * e.g. { dueDate: '\\d{4}-\\d{2}-\\d{2}', phone: '\\(\\d{3}\\) \\d{3}-\\d{4}' }
 */
export type ColumnRegexMap = Record<string, string>;

export interface FlaggedCell {
  rowId: string | number;
  column: string;
  value: any;
}

/** Converts regex string safely into RegExp objects */
function toRegex(source: string): RegExp {
  let pattern = source;

  // Add anchors if missing
  if (!pattern.startsWith('^')) pattern = '^' + pattern;
  if (!pattern.endsWith('$')) pattern = pattern + '$';

  try {
    return new RegExp(pattern);
  } catch (err) {
    console.error(`Invalid regex string passed to checkColumnFormat: "${source}"`, err);
    return /^.*$/; // Safe fallback so invalid regexes don't crash the validation loop
  }
}

/** Matches the auto-generated nested sub-item columns from flatten.ts (SUB_<ITEMCOL>_<depth>). */
function isSubItemColumn(column: string): boolean {
  return /^SUB_.+_\d+$/.test(column);
}

/** Checks one column's values against its expected format regex. */
export function checkColumnFormat(
  data: ExtractedData,
  column: string,
  formatSource: string
): FlaggedCell[] {
  const regex = toRegex(formatSource); // Turn string into regex
  const flagged: FlaggedCell[] = [];
  const structural = isSubItemColumn(column);

  for (const row of data.rows) {
    //for each cell of the column
    const value = row[column];
    const isEmpty = value === null || value === undefined || String(value).trim() === '';

    if (isEmpty) {
      // Sub-item columns are expected to be empty for rows that don't nest that deep -- skip.
      // Any other column being empty means no data was found for it at all -- flag it.
      if (!structural) {
        flagged.push({ rowId: row._id, column, value });
      }
      continue;
    }

    if (!regex.test(String(value).trim())) {
      // test of value at cell matches regex
      flagged.push({
        rowId: row._id,
        column,
        value,
      });
    }
  }

  return flagged;
}

/** Checks every column listed in formatMap. */
export function checkTableFormats(data: ExtractedData, formatMap: ColumnRegexMap): FlaggedCell[] {
  return Object.entries(formatMap).flatMap(([column, formatSource]) =>
    checkColumnFormat(data, column, formatSource)
  );
}
