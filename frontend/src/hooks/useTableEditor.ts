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
  onColumnRenamed?: (oldName: string, newName: string) => void;
}

// Replaces the near-identical onCellEdit/onRowAdd/onRowDelete/onColumnAdd/
// onColumnDelete/onColumnRename/onRowMove/onColumnReorder handlers that used
// to be written inline in ExtractedDataPanel's props. Cell edits and column
// renames log history entries with old/new values.
export function useTableEditor({
  currentPageIndexRef,
  extractedPagesRef,
  onPagesChange,
  onPersist,
  addHistoryEntry,
  pushUndo,
  onCellEdited,
  onColumnRenamed,
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

  const renameColumn = useCallback(
    (oldName: string, newName: string) => {
      const trimmedNew = newName.trim();
      const result = mutatePage((page) => tableOps.renameColumn(page, oldName, trimmedNew));
      if (!result) return;

      addHistoryEntry({
        type: 'edit',
        pageIndex: result.pageIndex,
        column: trimmedNew,
        oldValue: oldName,
        newValue: trimmedNew,
        description: `Renamed column "${oldName}" to "${trimmedNew}" on page ${result.pageIndex + 1}`,
      });

      onColumnRenamed?.(oldName, trimmedNew);
    },
    [mutatePage, addHistoryEntry, onColumnRenamed]
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

  return { editCell, addRow, deleteRow, addColumn, deleteColumn, renameColumn, moveRow, reorderColumns };
}
