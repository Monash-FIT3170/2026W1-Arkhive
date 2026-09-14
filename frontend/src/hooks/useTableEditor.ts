import { useCallback, type RefObject } from 'react';
import type { ExtractedPage } from '../models/TableData';
import type { HistoryEntry } from '../models/HistoryEntry';
import * as tableOps from '../utils/tableOperations';
import { usePageMutation } from './usePageMutation';

interface UseTableEditorOptions {
  currentPageIndexRef: RefObject<number>;
  extractedPagesRef: RefObject<ExtractedPage[]>;
  onPagesChange: (updater: (pages: ExtractedPage[]) => ExtractedPage[]) => void;
  onPersist: (pages: ExtractedPage[]) => void;
  addHistoryEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  pushUndo: (snapshot: ExtractedPage[]) => void;
  // Called after a successful cell edit only — row/column add/delete/move
  // don't carry per-field UI state (edited-cell highlighting, flagged-issue
  // clearing) the way a single cell edit does.
  onCellEdited?: (fieldId: string) => void;
}

// Replaces the six near-identical onCellEdit/onRowAdd/onRowDelete/onColumnAdd/
// onColumnDelete/onRowMove/onColumnReorder handlers that used to be written
// inline in ExtractedDataPanel's props. Only cell edits log a history entry
// with old/new values — that matched the original page's behavior, where row
// and column structural changes weren't tracked in history.
export function useTableEditor({
  currentPageIndexRef,
  extractedPagesRef,
  onPagesChange,
  onPersist,
  addHistoryEntry,
  pushUndo,
  onCellEdited,
}: UseTableEditorOptions) {
  const mutatePage = usePageMutation({
    currentPageIndexRef,
    extractedPagesRef,
    onPagesChange,
    onPersist,
    pushUndo,
  });

  const editCell = useCallback(
    (fieldId: string, newValue: string) => {
      const { rowId, column } = tableOps.parseFieldId(fieldId);
      const oldValue = tableOps.getCellValue(
        extractedPagesRef.current[currentPageIndexRef.current],
        fieldId
      );

      const result = mutatePage((page) => tableOps.editCell(page, rowId, column, newValue));
      if (!result) return;

      addHistoryEntry({
        type: 'edit',
        pageIndex: result.pageIndex,
        fieldId,
        column,
        oldValue,
        newValue,
        description: `Edited "${column}" on page ${result.pageIndex + 1}: "${oldValue}" to "${newValue}"`,
      });

      onCellEdited?.(fieldId);
    },
    [mutatePage, addHistoryEntry, onCellEdited, extractedPagesRef, currentPageIndexRef]
  );

  const addRow = useCallback(() => {
    mutatePage((page) => tableOps.addRow(page));
  }, [mutatePage]);

  const deleteRow = useCallback(
    (rowId: string | number) => {
      mutatePage((page) => tableOps.deleteRow(page, rowId));
    },
    [mutatePage]
  );

  const addColumn = useCallback(
    (columnName: string) => {
      mutatePage((page) => tableOps.addColumn(page, columnName));
    },
    [mutatePage]
  );

  const deleteColumn = useCallback(
    (columnName: string) => {
      mutatePage((page) => tableOps.deleteColumn(page, columnName));
    },
    [mutatePage]
  );

  const moveRow = useCallback(
    (rowId: string | number, direction: 'up' | 'down') => {
      mutatePage((page) => tableOps.moveRow(page, rowId, direction));
    },
    [mutatePage]
  );

  const reorderColumns = useCallback(
    (newColumns: string[]) => {
      mutatePage((page) => tableOps.reorderColumns(page, newColumns));
    },
    [mutatePage]
  );

  return { editCell, addRow, deleteRow, addColumn, deleteColumn, moveRow, reorderColumns };
}
