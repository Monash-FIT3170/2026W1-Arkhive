import type { ExtractedPage, ExtractedRow } from '../../../../models/TableData';
// Acknowledgement: Google Gemini was used to help generate this file
export type IndentDirection = 'in' | 'out';

/** One row's "own" item text, lifted out before its depth changes. */
interface OwnItemCell {
  value: string;
  confidence: number;
  ref?: string;
}

// ==========================================
// ITEM-COLUMN / SUB-ITEM-COLUMN HELPERS
// ==========================================

function subItemColumnName(itemColumnKey: string, depth: number): string {
  return `SUB_${itemColumnKey}_${depth}`;
}

/** Existing `SUB_<itemColumnKey>_<n>` columns, in depth order (index 0 = depth 1). */
function getExistingSubItemColumns(columns: string[], itemColumnKey: string): string[] {
  const pattern = new RegExp(`^SUB_${itemColumnKey}_(\\d+)$`);
  return columns
    .map((col) => ({ col, match: col.match(pattern) }))
    .filter((c): c is { col: string; match: RegExpMatchArray } => c.match !== null)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .map((c) => c.col);
}

/**
 * Makes sure there's a sub-item column for every depth up to `maxDepth`,
 * adding new ones to `columns` if needed (right after the deepest existing
 * one). Never removes columns — an outdent leaving a column unused is fine;
 * deleting it could strand data on other rows.
 */
function ensureSubItemColumns(
  columns: string[],
  itemColumnKey: string,
  maxDepth: number
): { columns: string[]; subItemColumns: string[] } {
  const existing = getExistingSubItemColumns(columns, itemColumnKey);
  if (existing.length >= maxDepth) {
    return { columns, subItemColumns: existing };
  }

  const newColumns = [...columns];
  const insertAfter = existing.length
    ? newColumns.indexOf(existing[existing.length - 1])
    : newColumns.indexOf(itemColumnKey);

  const added: string[] = [];
  for (let depth = existing.length + 1; depth <= maxDepth; depth++) {
    added.push(subItemColumnName(itemColumnKey, depth));
  }
  newColumns.splice(insertAfter + 1, 0, ...added);

  return { columns: newColumns, subItemColumns: [...existing, ...added] };
}

/** The column that holds a row's own item text at a given depth (0 = root). */
function itemColumnAt(itemColumnKey: string, subItemColumns: string[], depth: number): string {
  return depth === 0 ? itemColumnKey : subItemColumns[depth - 1];
}

function getOwnItemCell(
  row: ExtractedRow,
  itemColumnKey: string,
  subItemColumns: string[]
): OwnItemCell {
  const depth = row._indentLevel ?? 0;
  const col = itemColumnAt(itemColumnKey, subItemColumns, depth);
  return {
    value: row[col] ?? '',
    confidence: row._cellConfidence?.[col] ?? row._confidence ?? 1,
    ref: row._cellKeyMap?.[col],
  };
}

/** Writes a value into the item-column slot for a specific depth. */
function setItemCellAt(
  row: ExtractedRow,
  itemColumnKey: string,
  subItemColumns: string[],
  depth: number,
  cell: OwnItemCell
): void {
  const col = itemColumnAt(itemColumnKey, subItemColumns, depth);
  row[col] = cell.value;
  row._cellConfidence[col] = cell.confidence;
  if (cell.ref) {
    row._cellKeyMap = { ...(row._cellKeyMap ?? {}), [col]: cell.ref };
  }
}

/** Blanks every item/sub-item slot on a row before it's recomputed. */
function clearItemBand(row: ExtractedRow, itemColumnKey: string, subItemColumns: string[]): void {
  for (const col of [itemColumnKey, ...subItemColumns]) {
    row[col] = '';
    row._cellConfidence[col] = row._confidence ?? 1;
    if (row._cellKeyMap) delete row._cellKeyMap[col];
  }
}

// ==========================================
// REINDENTING
// ==========================================

/**
 * Moves one row (and, implicitly, its whole subtree — every following row
 * deeper than it) in or out by one level, and repositions each affected
 * row's own text into the item/sub-item column matching its new depth.
 *
 * Everything else on every row — cell edits, extra columns, row order,
 * confidences on unrelated columns — is left exactly as-is. This is a
 * transform on `page`, never a re-flatten from OCR.
 */
export function reindentRow(
  page: ExtractedPage,
  rowId: string | number,
  direction: IndentDirection
): ExtractedPage {
  const { rows, itemColumnKey } = page;
  const rowIndex = rows.findIndex((r) => r._id === rowId);
  if (rowIndex === -1) return page;

  const oldLevel = rows[rowIndex]._indentLevel ?? 0;
  const levelAbove = rowIndex > 0 ? (rows[rowIndex - 1]._indentLevel ?? 0) : 0;

  const newLevel =
    direction === 'in'
      ? Math.min(oldLevel + 1, levelAbove + 1) // can't jump deeper than 1 below the row above
      : Math.max(0, oldLevel - 1);

  if (newLevel === oldLevel) return page; // nothing to do (e.g. already at max/min depth)

  const delta = newLevel - oldLevel;

  // The subtree is this row plus every following row deeper than it —
  // those rows move by the same delta so their relative nesting under this
  // row is preserved.
  let subtreeEnd = rowIndex + 1;
  while (subtreeEnd < rows.length && (rows[subtreeEnd]._indentLevel ?? 0) > oldLevel) {
    subtreeEnd++;
  }

  const deepestNewLevel = Math.max(
    ...rows.slice(rowIndex, subtreeEnd).map((r) => (r._indentLevel ?? 0) + delta)
  );
  const { columns, subItemColumns } = ensureSubItemColumns(
    page.columns,
    itemColumnKey,
    deepestNewLevel
  );

  // Capture each subtree row's own text BEFORE mutating anything — once we
  // start clearing item-band columns we'd lose it.
  const ownCells = rows
    .slice(rowIndex, subtreeEnd)
    .map((r) => getOwnItemCell(r, itemColumnKey, subItemColumns));

  const newRows = rows.map((r) => ({ ...r, _cellConfidence: { ...r._cellConfidence } }));

  for (let i = rowIndex; i < subtreeEnd; i++) {
    newRows[i]._indentLevel = (rows[i]._indentLevel ?? 0) + delta;
    clearItemBand(newRows[i], itemColumnKey, subItemColumns);
  }

  // Re-fill each subtree row's item band: its own text at its new depth,
  // plus its ancestors' text (found by walking backwards through the rows
  // that precede it) at every shallower depth.
  for (let i = rowIndex; i < subtreeEnd; i++) {
    const level = newRows[i]._indentLevel ?? 0;
    setItemCellAt(newRows[i], itemColumnKey, subItemColumns, level, ownCells[i - rowIndex]);

    let neededDepth = level - 1;
    for (let j = i - 1; j >= 0 && neededDepth >= 0; j--) {
      if ((newRows[j]._indentLevel ?? 0) === neededDepth) {
        const ancestorCell = getOwnItemCell(newRows[j], itemColumnKey, subItemColumns);
        setItemCellAt(newRows[i], itemColumnKey, subItemColumns, neededDepth, ancestorCell);
        neededDepth--;
      }
    }
  }

  return { ...page, columns, rows: newRows };
}
