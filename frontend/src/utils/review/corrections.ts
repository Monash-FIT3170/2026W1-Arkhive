import type { ExtractedPage } from '../../models/TableData';
import type { HistoryEntry } from '../../models/HistoryEntry';
import { makeFieldId } from '../keys';

export interface CellUpdate {
  pageIndex: number;
  rowId: string;
  column: string;
  newValue: string;
}

export function readCell(
  pages: readonly ExtractedPage[],
  pageIndex: number,
  rowId: string,
  column: string
): string {
  const row = pages[pageIndex]?.rows.find((r) => String(r._id) === rowId);
  return row ? String(row[column] ?? '') : '';
}

/**
 * Returns a new pages array with the updates applied. Untouched pages and rows
 * keep their identity, so React memoization downstream still works.
 */
export function applyCellUpdates(
  pages: ExtractedPage[],
  updates: readonly CellUpdate[]
): ExtractedPage[] {
  if (updates.length === 0) return pages;

  // pageIndex -> rowId -> { column: newValue }
  const patches = new Map<number, Map<string, Record<string, string>>>();
  updates.forEach(({ pageIndex, rowId, column, newValue }) => {
    const rows = patches.get(pageIndex) ?? new Map<string, Record<string, string>>();
    rows.set(rowId, { ...rows.get(rowId), [column]: newValue });
    patches.set(pageIndex, rows);
  });

  return pages.map((page, i) => {
    const rowPatches = patches.get(i);
    if (!rowPatches) return page;
    return {
      ...page,
      rows: page.rows.map((row) => {
        const patch = rowPatches.get(String(row._id));
        return patch ? { ...row, ...patch } : row;
      }),
    };
  });
}

/**
 * Builds the history entry for a correction. `before` MUST be the pages
 * snapshot from before the update was applied, otherwise oldValue is wrong.
 */
export function describeCorrection(
  kind: 'accept' | 'edit',
  before: readonly ExtractedPage[],
  update: CellUpdate
): Omit<HistoryEntry, 'id' | 'timestamp'> {
  const oldValue = readCell(before, update.pageIndex, update.rowId, update.column);
  const verb = kind === 'accept' ? 'Accepted correction for' : 'Manually corrected';
  return {
    type: kind,
    pageIndex: update.pageIndex,
    fieldId: makeFieldId(update.rowId, update.column),
    column: update.column,
    oldValue,
    newValue: update.newValue,
    description: `${verb} "${update.column}" on page ${update.pageIndex + 1}: "${oldValue}" to "${update.newValue}"`,
  };
}
