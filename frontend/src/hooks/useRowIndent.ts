import { useCallback, type RefObject } from 'react';
import type { ExtractedPage } from '../models/TableData';
import type { HistoryEntry } from '../models/HistoryEntry';
import { reindentRow } from '../utils/indentEditor';
import type { IndentDirection } from '../utils/indentEditor';
import { usePageMutation } from './usePageMutation';

interface UseRowIndentOptions {
  currentPageIndexRef: RefObject<number>;
  extractedPagesRef: RefObject<ExtractedPage[]>;
  onPagesChange: (updater: (pages: ExtractedPage[]) => ExtractedPage[]) => void;
  onPersist: (pages: ExtractedPage[]) => void;
  addHistoryEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  pushUndo: (snapshot: ExtractedPage[]) => void;
}

export function useRowIndent({
  currentPageIndexRef,
  extractedPagesRef,
  onPagesChange,
  onPersist,
  addHistoryEntry,
  pushUndo,
}: UseRowIndentOptions) {
  const mutatePage = usePageMutation({
    currentPageIndexRef,
    extractedPagesRef,
    onPagesChange,
    onPersist,
    pushUndo,
  });

  const applyReindent = useCallback(
    (rowId: string | number, direction: IndentDirection) => {
      const result = mutatePage((page) => reindentRow(page, rowId, direction));
      if (!result) return; // already at min/max depth, nothing changed

      addHistoryEntry({
        type: 'edit',
        pageIndex: result.pageIndex,
        fieldId: String(rowId),
        column: '_indentLevel',
        oldValue: '',
        newValue: direction,
        description: `${direction === 'in' ? 'Indented' : 'Outdented'} row on page ${result.pageIndex + 1}`,
      });
    },
    [mutatePage, addHistoryEntry]
  );

  const handleRowIndent = useCallback(
    (rowId: string | number) => applyReindent(rowId, 'in'),
    [applyReindent]
  );

  const handleRowOutdent = useCallback(
    (rowId: string | number) => applyReindent(rowId, 'out'),
    [applyReindent]
  );

  return { handleRowIndent, handleRowOutdent };
}
