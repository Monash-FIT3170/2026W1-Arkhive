import { useCallback, type RefObject } from 'react';
import type { ExtractedPage } from '../models/TableData';

interface UsePageMutationOptions {
  currentPageIndexRef: RefObject<number>;
  extractedPagesRef: RefObject<ExtractedPage[]>;
  onPagesChange: (updater: (pages: ExtractedPage[]) => ExtractedPage[]) => void;
  onPersist: (pages: ExtractedPage[]) => void;
  pushUndo: (snapshot: ExtractedPage[]) => void;
}

// The common core behind every "edit the current page" action: read the
// current page, apply a pure tableOps transform to it, skip as a no-op if
// the transform didn't actually change anything (checked by reference —
// every tableOps function returns its input unchanged when there's nothing
// to do, e.g. adding a duplicate column or moving a row past the edge),
// otherwise snapshot for undo, write the result back, and persist.
//
// useRowIndent and useTableEditor both build on this instead of each
// re-implementing the same read/no-op-check/undo/persist sequence.
export function usePageMutation({
  currentPageIndexRef,
  extractedPagesRef,
  onPagesChange,
  onPersist,
  pushUndo,
}: UsePageMutationOptions) {
  return useCallback(
    (
      transform: (page: ExtractedPage) => ExtractedPage
    ): { pageIndex: number; page: ExtractedPage } | null => {
      const pageIndex = currentPageIndexRef.current;
      const currentPage = extractedPagesRef.current[pageIndex];
      if (!currentPage) return null;

      const next = transform(currentPage);
      if (next === currentPage) return null; // no-op

      pushUndo(extractedPagesRef.current);
      onPagesChange((prev) => prev.map((page, i) => (i === pageIndex ? next : page)));
      onPersist(extractedPagesRef.current);

      return { pageIndex, page: next };
    },
    [currentPageIndexRef, extractedPagesRef, onPagesChange, onPersist, pushUndo]
  );
}
