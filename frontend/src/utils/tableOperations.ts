// Pure, side-effect-free transforms over ExtractedPage. Both ProjectWorkspacePage
// (per-document-page state) and ValidationPage (per-session-page state) mutate
// extracted table data the same way — the only difference is *where* the result
// gets written back to (setDocuments vs setExtractedPages). Centralizing the
// transform logic here means both call sites stay in sync automatically.

import type { ExtractedPage } from '../models/TableData';

export function editCell(
  data: ExtractedPage,
  rowId: string,
  column: string,
  newValue: string
): ExtractedPage {
  return {
    ...data,
    rows: data.rows.map((r) => (String(r._id) === rowId ? { ...r, [column]: newValue } : r)),
  };
}

export function addRow(data: ExtractedPage): ExtractedPage {
  const newRow: any = {
    _id: `manual_row_${Date.now()}`,
    _confidence: 1,
    _cellConfidence: {},
  };
  data.columns.forEach((col) => {
    newRow[col] = '';
  });
  return { ...data, rows: [...data.rows, newRow] };
}

export function deleteRow(data: ExtractedPage, rowId: string | number): ExtractedPage {
  return { ...data, rows: data.rows.filter((r) => r._id !== rowId) };
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

export function moveRow(
  data: ExtractedPage,
  rowId: string | number,
  direction: 'up' | 'down'
): ExtractedPage {
  const rows = [...data.rows];
  const idx = rows.findIndex((r) => r._id === rowId);
  const canMove =
    idx !== -1 &&
    ((direction === 'up' && idx > 0) || (direction === 'down' && idx < rows.length - 1));
  if (!canMove) return data;
  if (direction === 'up') [rows[idx - 1], rows[idx]] = [rows[idx], rows[idx - 1]];
  else [rows[idx], rows[idx + 1]] = [rows[idx + 1], rows[idx]];
  return { ...data, rows };
}

export function reorderColumns(data: ExtractedPage, newColumns: string[]): ExtractedPage {
  return { ...data, columns: newColumns };
}

export function renameColumn(
  data: ExtractedPage,
  oldName: string,
  newName: string
): ExtractedPage {
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

export function parseFieldId(fieldId: string): { rowId: string; column: string } {
  const [rowId, column] = fieldId.split(':');
  return { rowId, column };
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
