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
    const result = mutatePage((page) => tableOps.addRow(page));
    if (!result) return;

    addHistoryEntry({
      type: 'edit',
      pageIndex: result.pageIndex,
      description: `Added row on page ${result.pageIndex + 1}`,
    });
  }, [mutatePage, addHistoryEntry]);

  const deleteRow = useCallback(
    (rowId: string | number) => {
      const result = mutatePage((page) => tableOps.deleteRow(page, rowId));
      if (!result) return;

      addHistoryEntry({
        type: 'edit',
        pageIndex: result.pageIndex,
        fieldId: String(rowId),
        description: `Deleted row on page ${result.pageIndex + 1}`,
      });
    },
    [mutatePage, addHistoryEntry]
  );

  const addColumn = useCallback(
    (columnName: string) => {
      const trimmed = columnName.trim();
      const result = mutatePage((page) => tableOps.addColumn(page, trimmed));
      if (!result) return;

      addHistoryEntry({
        type: 'edit',
        pageIndex: result.pageIndex,
        column: trimmed,
        newValue: trimmed,
        description: `Added column "${trimmed}" on page ${result.pageIndex + 1}`,
      });
    },
    [mutatePage, addHistoryEntry]
  );

  const deleteColumn = useCallback(
    (columnName: string) => {
      const result = mutatePage((page) => tableOps.deleteColumn(page, columnName));
      if (!result) return;

      addHistoryEntry({
        type: 'edit',
        pageIndex: result.pageIndex,
        column: columnName,
        oldValue: columnName,
        description: `Deleted column "${columnName}" on page ${result.pageIndex + 1}`,
      });
    },
    [mutatePage, addHistoryEntry]
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

  // Changes which column the hierarchy (indent band) is carried by.
  const setIndentColumn = useCallback(
    (column: string) => {
      const from = extractedPagesRef.current[currentPageIndexRef.current]?.itemColumnKey ?? '';
      const result = mutatePage((page) => tableOps.setItemColumn(page, column));
      if (!result) return;

      addHistoryEntry({
        type: 'edit',
        pageIndex: result.pageIndex,
        column,
        oldValue: from,
        newValue: column,
        description: `Changed indent column from "${from}" to "${column}" on page ${result.pageIndex + 1}`,
      });
    },
    [mutatePage, addHistoryEntry, extractedPagesRef, currentPageIndexRef]
  );

  const moveRow = useCallback(
    (rowId: string | number, direction: 'up' | 'down') => {
      const result = mutatePage((page) => tableOps.moveRow(page, rowId, direction));
      if (!result) return;

      addHistoryEntry({
        type: 'edit',
        pageIndex: result.pageIndex,
        fieldId: String(rowId),
        description: `Moved row ${direction} on page ${result.pageIndex + 1}`,
      });
    },
    [mutatePage, addHistoryEntry]
  );

  const reorderColumns = useCallback(
    (newColumns: string[]) => {
      const result = mutatePage((page) => tableOps.reorderColumns(page, newColumns));
      if (!result) return;

      addHistoryEntry({
        type: 'edit',
        pageIndex: result.pageIndex,
        description: `Reordered columns on page ${result.pageIndex + 1}`,
      });
    },
    [mutatePage, addHistoryEntry]
  );

  return {
    editCell,
    addRow,
    deleteRow,
    addColumn,
    deleteColumn,
    renameColumn,
    moveRow,
    reorderColumns,
    setIndentColumn,
  };
}
