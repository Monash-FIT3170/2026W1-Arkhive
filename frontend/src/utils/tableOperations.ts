// Pure, side-effect-free transforms over ExtractedPage. Both ProjectWorkspacePage
// (per-document-page state) and ValidationPage (per-session-page state) mutate
// extracted table data the same way — the only difference is *where* the result
// gets written back to (setDocuments vs setExtractedPages). Centralizing the
// transform logic here means both call sites stay in sync automatically.

import type { ExtractedPage } from '../models/TableData';
import {
  restructure,
  subtreeEnd,
  itemBandDepth,
  subItemDepth,
  subItemColumnName,
  isDerivedColumn,
} from './indentEditor';

// Changing which column carries the hierarchy lives with the rest of the indent logic.
export { setItemColumn } from './indentEditor';

const levelOf = (r: { _indentLevel?: number }): number => r._indentLevel ?? 0;

/**
 * Edits one displayed cell. Most cells are a plain edit, but two kinds of cell
 * are views of another row's data, so they're handled through the hierarchy:
 *
 *  - Item-band cells (the item column and `SUB_` columns): a child row shows its
 *    ancestors' names there. Editing one renames the ANCESTOR that owns the text,
 *    and every descendant's copy updates with it. Slots deeper than the row
 *    itself are empty by definition and can't be edited.
 *  - Left-of-item columns (code, category...): they inherit from the nearest
 *    ancestor with a value. Typing in one gives this row its own value;
 *    clearing it goes back to inheriting.
 */
export function editCell(
  data: ExtractedPage,
  rowId: string,
  column: string,
  newValue: string
): ExtractedPage {
  const idx = data.rows.findIndex((r) => String(r._id) === rowId);
  if (idx === -1) return data;
  const row = data.rows[idx];

  const bandDepth = itemBandDepth(data, column);
  if (bandDepth !== null && data.columns.includes(data.itemColumnKey)) {
    if (bandDepth > levelOf(row)) return data; // empty slot below this row's depth
    // The text lives on the nearest row at or above this one whose level is bandDepth.
    let ownerIdx = idx;
    while (ownerIdx > 0 && levelOf(data.rows[ownerIdx]) > bandDepth) ownerIdx--;
    const edited = {
      ...data,
      rows: data.rows.map((r, i) => (i === ownerIdx ? { ...r, [column]: newValue } : r)),
    };
    return restructure(edited, (rows) => rows);
  }

  const itemIdx = data.columns.indexOf(data.itemColumnKey);
  const colIdx = data.columns.indexOf(column);
  if (itemIdx !== -1 && colIdx !== -1 && colIdx < itemIdx) {
    const ref = row._cellKeyMap?.[column];
    const ownsIt = ref !== undefined && ref.startsWith(`${String(row._id)}:`);
    const edited = {
      ...data,
      rows: data.rows.map((r, i) =>
        i === idx
          ? {
              ...r,
              [column]: newValue,
              // stamp this row as the owner so a later restructure doesn't overwrite it with the ancestor's value
              _cellKeyMap: ownsIt
                ? r._cellKeyMap
                : { ...(r._cellKeyMap ?? {}), [column]: `${rowId}:${column}` },
            }
          : r
      ),
    };
    return restructure(edited, (rows) => rows);
  }

  return {
    ...data,
    rows: data.rows.map((r, i) => (i === idx ? { ...r, [column]: newValue } : r)),
  };
}

export function addRow(data: ExtractedPage): ExtractedPage {
  const newRow: any = {
    _id: `manual_row_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    _confidence: 1,
    _indentLevel: 0,
    _cellConfidence: {},
    _cellKeyMap: {},
  };
  data.columns.forEach((col) => {
    newRow[col] = '';
  });
  return { ...data, rows: [...data.rows, newRow] };
}

/**
 * Deletes one row. Its children are promoted one level (they become siblings of
 * where it was, under its parent) instead of being left pointing at a parent
 * that no longer exists.
 */
export function deleteRow(data: ExtractedPage, rowId: string | number): ExtractedPage {
  const idx = data.rows.findIndex((r) => String(r._id) === String(rowId));
  if (idx === -1) return data; // same reference = no-op (no bogus undo entry)
  const end = subtreeEnd(data.rows, idx);
  return restructure(data, (rows) => {
    for (let i = idx + 1; i < end; i++) rows[i]._indentLevel = levelOf(rows[i]) - 1;
    rows.splice(idx, 1);
    return rows;
  });
}

export function addColumn(data: ExtractedPage, columnName: string): ExtractedPage {
  if (data.columns.includes(columnName)) return data;
  return {
    ...data,
    columns: [...data.columns, columnName],
    rows: data.rows.map((r) => ({ ...r, [columnName]: '' })),
  };
}

export function deleteColumn(data: ExtractedPage, columnName: string): ExtractedPage {
  if (isDerivedColumn(data, columnName)) return data; // SUB_ columns are managed by indent/outdent
  return {
    ...data,
    columns: data.columns.filter((c) => c !== columnName),
    rows: data.rows.map((r) => {
      const newRow = { ...r };
      delete newRow[columnName];
      return newRow;
    }),
  };
}

/**
 * Moves a row — together with its children — past the neighbouring row at the
 * same level. A row can't leave its parent by moving (use outdent for that), so
 * the first/last child of a parent has nowhere to go in that direction.
 * For a flat table this is the usual swap with the adjacent row.
 */
export function moveRow(
  data: ExtractedPage,
  rowId: string | number,
  direction: 'up' | 'down'
): ExtractedPage {
  const rows = data.rows;
  const idx = rows.findIndex((r) => String(r._id) === String(rowId));
  if (idx === -1) return data;
  const level = levelOf(rows[idx]);
  const end = subtreeEnd(rows, idx);

  if (direction === 'up') {
    let prev = idx - 1;
    while (prev >= 0 && levelOf(rows[prev]) > level) prev--;
    if (prev < 0 || levelOf(rows[prev]) < level) return data;
    return restructure(data, (r) => [
      ...r.slice(0, prev),
      ...r.slice(idx, end),
      ...r.slice(prev, idx),
      ...r.slice(end),
    ]);
  }

  if (end >= rows.length || levelOf(rows[end]) < level) return data;
  const nextEnd = subtreeEnd(rows, end);
  return restructure(data, (r) => [
    ...r.slice(0, idx),
    ...r.slice(end, nextEnd),
    ...r.slice(idx, end),
    ...r.slice(nextEnd),
  ]);
}

/**
 * Reorders columns. Inheritance depends on which columns sit left of the item
 * column, so the hierarchy is re-derived afterwards.
 */
export function reorderColumns(data: ExtractedPage, newColumns: string[]): ExtractedPage {
  if (
    newColumns.length === data.columns.length &&
    newColumns.every((c, i) => c === data.columns[i])
  ) {
    return data;
  }
  return restructure({ ...data, columns: newColumns }, (rows) => rows);
}

export function renameColumn(data: ExtractedPage, oldName: string, newName: string): ExtractedPage {
  if (isDerivedColumn(data, oldName)) return data; // SUB_ columns are managed by indent/outdent
  const trimmedNew = newName.trim();
  if (trimmedNew && oldName === data.itemColumnKey && !data.columns.includes(trimmedNew)) {
    // The SUB_ columns are named after the item column; carry them along so they
    // stay recognisable (otherwise the next indent would create a second set).
    let next = data;
    for (const col of data.columns) {
      const depth = subItemDepth(col, oldName);
      if (depth !== null) next = renameOne(next, col, subItemColumnName(trimmedNew, depth));
    }
    return renameOne(next, oldName, trimmedNew);
  }
  return renameOne(data, oldName, trimmedNew);
}

function renameOne(data: ExtractedPage, oldName: string, newName: string): ExtractedPage {
  const trimmedNew = newName.trim();
  if (!trimmedNew || oldName === trimmedNew) return data;
  if (!data.columns.includes(oldName)) return data;
  if (data.columns.includes(trimmedNew)) return data;

  const newColumns = data.columns.map((c) => (c === oldName ? trimmedNew : c));

  const newRows = data.rows.map((r) => {
    const newRow = { ...r };
    if (oldName in newRow) {
      newRow[trimmedNew] = newRow[oldName];
      delete newRow[oldName];
    } else {
      newRow[trimmedNew] = '';
    }
    if (newRow._cellKeyMap && oldName in newRow._cellKeyMap) {
      newRow._cellKeyMap = {
        ...newRow._cellKeyMap,
        [trimmedNew]: newRow._cellKeyMap[oldName],
      };
      delete newRow._cellKeyMap[oldName];
    }
    if (newRow._cellConfidence && oldName in newRow._cellConfidence) {
      newRow._cellConfidence = {
        ...newRow._cellConfidence,
        [trimmedNew]: newRow._cellConfidence[oldName],
      };
      delete newRow._cellConfidence[oldName];
    }
    return newRow;
  });

  return {
    ...data,
    columns: newColumns,
    rows: newRows,
    itemColumnKey: data.itemColumnKey === oldName ? trimmedNew : data.itemColumnKey,
  };
}

// Split on the FIRST colon only, so column names containing ':' ("Qty:") survive.
export function parseFieldId(fieldId: string): { rowId: string; column: string } {
  const at = fieldId.indexOf(':');
  if (at === -1) return { rowId: fieldId, column: '' };
  return { rowId: fieldId.slice(0, at), column: fieldId.slice(at + 1) };
}

// The bit that was copy-pasted verbatim in ProjectWorkspacePage's onHover,
// ValidationPage's onHover, and ValidationPage's handleSlideChange.
export function getOverlayIdForField(
  data: ExtractedPage | null | undefined,
  fieldId: string
): string | null {
  if (!data) return null;
  const { rowId, column } = parseFieldId(fieldId);
  const row = data.rows.find((r) => String(r._id) === rowId);
  return row?._cellKeyMap?.[column] ?? null;
}

export function getCellValue(data: ExtractedPage | null | undefined, fieldId: string): string {
  if (!data) return '';
  const { rowId, column } = parseFieldId(fieldId);
  const row = data.rows.find((r) => String(r._id) === rowId);
  return row ? String(row[column] ?? '') : '';
}
