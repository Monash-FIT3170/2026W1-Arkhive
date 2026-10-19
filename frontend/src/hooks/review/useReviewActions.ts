import { useCallback, type RefObject } from 'react';
import type { ExtractedPage } from '../../models/TableData';
import type { HistoryEntry } from '../../models/HistoryEntry';
import type { ReviewsByPage } from '../../models/IssueReview';
import type { ReviewTransition } from './useReviewStore';
import { parseFieldId } from '../../utils/keys';
import { applyCellUpdates, describeCorrection } from '../../utils/review/corrections';
import { findOpenIssue, renameColumn, resolveIssues } from '../../utils/review/reviewState';

interface UseReviewActionsOptions {
  pageKeys: readonly string[];
  reviews: ReviewsByPage;
  updateReview: (pageKey: string, transition: ReviewTransition) => void;
  pagesRef: RefObject<ExtractedPage[]>;
  pageIndexRef: RefObject<number>;
  onPagesChange: (updater: (pages: ExtractedPage[]) => ExtractedPage[]) => void;
  onPersist: (pages: ExtractedPage[]) => void;
  addHistoryEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  pushUndo?: (snapshot: ExtractedPage[]) => void;
}

type FieldUpdate = { fieldId: string; newValue: string };

export function useReviewActions({
  pageKeys,
  reviews,
  updateReview,
  pagesRef,
  pageIndexRef,
  onPagesChange,
  onPersist,
  addHistoryEntry,
  pushUndo,
}: UseReviewActionsOptions) {
  /**
   * Shared by accept + manual edit: compute the new pages ONCE from the
   * current snapshot, then hand that same value to state, persistence, and
   * history. (The old code persisted `ref.current` right after queuing a
   * setState updater, which could still hold the pre-edit pages.)
   */
  const applyCorrections = useCallback(
    (kind: 'accept' | 'edit', updates: readonly FieldUpdate[]) => {
      const pageIndex = pageIndexRef.current;
      const pageKey = pageKeys[pageIndex];
      if (pageKey === undefined || updates.length === 0) return;

      const before = pagesRef.current;
      const cellUpdates = updates.map(({ fieldId, newValue }) => ({
        pageIndex,
        ...parseFieldId(fieldId),
        newValue,
      }));
      const after = applyCellUpdates(before, cellUpdates);

      pushUndo?.(before);
      onPagesChange(() => after);
      onPersist(after);
      cellUpdates.forEach((u) => addHistoryEntry(describeCorrection(kind, before, u)));

      const resolution = kind === 'accept' ? 'accepted' : 'edited';
      updateReview(pageKey, (review) =>
        resolveIssues(
          review,
          updates.map((u) => u.fieldId),
          resolution
        )
      );
    },
    [
      pageKeys,
      pagesRef,
      pageIndexRef,
      pushUndo,
      onPagesChange,
      onPersist,
      addHistoryEntry,
      updateReview,
    ]
  );

  const handleCarouselAccept = useCallback(
    (updates: FieldUpdate[]) => applyCorrections('accept', updates),
    [applyCorrections]
  );

  const handleCarouselManualEdit = useCallback(
    (fieldId: string, newValue: string) => applyCorrections('edit', [{ fieldId, newValue }]),
    [applyCorrections]
  );

  const handleCarouselReject = useCallback(
    (fieldIds: string[]) => {
      const pageIndex = pageIndexRef.current;
      const pageKey = pageKeys[pageIndex];
      if (pageKey === undefined) return;

      fieldIds.forEach((fieldId) => {
        const issue = findOpenIssue(reviews[pageKey], fieldId);
        addHistoryEntry({
          type: 'skip',
          pageIndex,
          fieldId,
          column: issue?.fieldName,
          oldValue: issue?.ocrValue,
          description: `Skipped "${issue?.fieldName}" on page ${pageIndex + 1}: "${issue?.ocrValue}"`,
        });
      });

      updateReview(pageKey, (review) => resolveIssues(review, fieldIds, 'rejected'));
    },
    [pageKeys, pageIndexRef, reviews, addHistoryEntry, updateReview]
  );

  // ── Keeping the queue in sync with edits made directly in the table ───────

  const handleCellEdited = useCallback(
    (fieldId: string) => {
      const pageKey = pageKeys[pageIndexRef.current];
      if (pageKey !== undefined) {
        updateReview(pageKey, (review) => resolveIssues(review, [fieldId], 'edited'));
      }
    },
    [pageKeys, pageIndexRef, updateReview]
  );

  const handleColumnRenamed = useCallback(
    (from: string, to: string) => {
      const pageKey = pageKeys[pageIndexRef.current];
      if (pageKey !== undefined) {
        updateReview(pageKey, (review) => renameColumn(review, from, to));
      }
    },
    [pageKeys, pageIndexRef, updateReview]
  );

  return {
    handleCarouselAccept,
    handleCarouselReject,
    handleCarouselManualEdit,
    handleCellEdited,
    handleColumnRenamed,
  };
}
