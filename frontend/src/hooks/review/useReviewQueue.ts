import { useCallback, useMemo, type RefObject } from 'react';
import type { ExtractedPage } from '../../models/TableData';
import type { HistoryEntry } from '../../models/HistoryEntry';
import type { PageReview, ReviewsByPage } from '../../models/IssueReview';
import { flattenOpenIssues, openIssues } from '../../utils/review/reviewState';
import { useReviewStore } from './useReviewStore';
import { useReviewScanner } from './useReviewScanner';
import { useReviewActions } from './useReviewActions';
import { useReviewSuggestions } from './useReviewSuggestions';

export interface UseReviewQueueOptions {
  extractedPages: ExtractedPage[];
  /** Render-time index, used only to derive `currentPageStatus`. */
  currentPageIndex: number;
  /** Event-time index. Handlers read this so they never act on a stale page. */
  currentPageIndexRef: RefObject<number>;
  extractedPagesRef: RefObject<ExtractedPage[]>;
  onPagesChange: (updater: (pages: ExtractedPage[]) => ExtractedPage[]) => void;
  onPersist: (pages: ExtractedPage[]) => void;
  addHistoryEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  pushUndo?: (snapshot: ExtractedPage[]) => void;
  /** Fires when a fresh scan finds issues, e.g. to switch the chat panel to "review". */
  onIssuesDetected?: () => void;
  /**
   * Stable key per page, aligned with `extractedPages`
   * (`makePageKey(documentId, pageIndex)` in projects). Falls back to the
   * array index, which is fine for quick scan as long as pages aren't reordered.
   */
  pageKeys?: string[];
  /**
   * Persisted reviews to hydrate from (`document_pages.review_state`).
   * Pages present here are NOT re-scanned. Keep this reference stable (useMemo).
   * Omit for quick scan: review state then lives in memory only.
   */
  initialReviews?: ReviewsByPage;
  /** Called with a page's new review whenever it changes. Wire to a save endpoint. */
  onReviewChange?: (pageKey: string, review: PageReview) => void;
}

/**
 * The review queue: scans pages for low-confidence / badly-formatted cells,
 * tracks which issues are still open, and applies accept / reject / edit.
 *
 *   useReviewStore        review state per page + persistence signal
 *   useReviewScanner      auto-scan unscanned pages, manual rescan
 *   useReviewActions      accept / reject / manual edit / table-edit sync
 *   useReviewSuggestions  AI suggestions (single + bulk)
 *   utils/review/*        the pure logic all of the above delegate to
 */
export function useReviewQueue({
  extractedPages,
  currentPageIndex,
  currentPageIndexRef,
  extractedPagesRef,
  onPagesChange,
  onPersist,
  addHistoryEntry,
  pushUndo,
  onIssuesDetected,
  pageKeys: providedKeys,
  initialReviews,
  onReviewChange,
}: UseReviewQueueOptions) {
  const pageCount = extractedPages.length;
  const pageKeys = useMemo(
    () => providedKeys ?? Array.from({ length: pageCount }, (_, i) => String(i)),
    [providedKeys, pageCount]
  );

  const { reviews, putReview, updateReview } = useReviewStore(initialReviews, onReviewChange);

  const { scanningPageKeys, rescanPage } = useReviewScanner({
    pageKeys,
    reviews,
    pagesRef: extractedPagesRef,
    putReview,
    onIssuesDetected: onIssuesDetected && (() => onIssuesDetected()),
  });

  const actions = useReviewActions({
    pageKeys,
    reviews,
    updateReview,
    pagesRef: extractedPagesRef,
    pageIndexRef: currentPageIndexRef,
    onPagesChange,
    onPersist,
    addHistoryEntry,
    pushUndo,
  });

  const suggestions = useReviewSuggestions({
    pageKeys,
    reviews,
    pagesRef: extractedPagesRef,
    pageIndexRef: currentPageIndexRef,
  });

  const flaggedIssues = useMemo(() => flattenOpenIssues(pageKeys, reviews), [pageKeys, reviews]);

  const currentPageKey = pageKeys[currentPageIndex];
  const currentReview = currentPageKey === undefined ? undefined : reviews[currentPageKey];
  const currentPageStatus = {
    scanned: currentReview !== undefined,
    scanning: currentPageKey !== undefined && scanningPageKeys.has(currentPageKey),
    /** False = the LLM format check failed for this page; suggest a re-scan. */
    formatCheckOk: currentReview?.formatCheckOk ?? true,
    openIssueCount: openIssues(currentReview).length,
  };

  const rescanCurrentPage = useCallback(async () => {
    const key = pageKeys[currentPageIndexRef.current];
    if (key !== undefined) await rescanPage(key);
  }, [pageKeys, currentPageIndexRef, rescanPage]);

  return {
    flaggedIssues,
    currentPageStatus,
    rescanPage,
    rescanCurrentPage,
    ...actions,
    ...suggestions,
  };
}
