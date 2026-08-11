import { ReviewField } from '../../../models/message';
import { ExtractedData } from '../../../models/TableData';

type ColumnTypeGuess = 'numeric' | 'currency' | 'date' | 'text' | 'unknown';

// Function that infers the data type of the cell via regular expressions of a list of values
function inferColumnType(values: string[]): ColumnTypeGuess {
  const nonEmpty = values.filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
  if (nonEmpty.length === 0) return 'unknown';

  const isCurrency = (v: string) => /^[$£€]\s?-?\d+(\.\d{1,2})?$/.test(v.trim());
  const isDate = (v: string) => /^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$/.test(v.trim());
  const isNumeric = (v: string) => /^-?\d+(\.\d+)?$/.test(v.trim());

  const counts: Record<'currency' | 'date' | 'numeric', number> = {
    currency: 0,
    date: 0,
    numeric: 0,
  };
  for (const raw of nonEmpty) {
    const v = String(raw);
    if (isCurrency(v)) counts.currency++;
    else if (isDate(v)) counts.date++;
    else if (isNumeric(v)) counts.numeric++;
  }

  const total = nonEmpty.length;
  const [topType, topCount] = (Object.entries(counts) as [ColumnTypeGuess, number][]).sort(
    (a, b) => b[1] - a[1]
  )[0];

  // Require a clear majority before committing to a type guess — a 2/7 match
  // isn't worth telling the model "this column is a date column."
  return topCount / total >= 0.6 ? topType : 'text';
}

// Function that given the document context and the review field
// returns the specfically the items in the same row, and items in the same column
export function buildFocusedContext(documentContext: ExtractedData, field: ReviewField) {
  const rowIndex = documentContext.rows.findIndex((r) => r._id === field.rowId);
  const targetRow = documentContext.rows[rowIndex];

  const otherFieldsInRow = documentContext.columns
    .filter((col) => col !== field.column)
    .map((col) => ({ column: col, value: targetRow?.[col] }));

  const columnValuesFromOtherRows = documentContext.rows
    .map((r, idx) => ({ rowIndex: idx, value: r[field.column] }))
    .filter(
      (r) =>
        r.rowIndex !== rowIndex &&
        r.value !== undefined &&
        r.value !== null &&
        String(r.value).trim() !== ''
    );

  const columnType = inferColumnType(columnValuesFromOtherRows.map((r) => String(r.value)));

  return { rowIndex, otherFieldsInRow, columnValuesFromOtherRows, columnType };
}
