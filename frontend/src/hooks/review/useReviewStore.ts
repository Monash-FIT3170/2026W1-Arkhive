import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PageReview, ReviewsByPage } from '../../models/IssueReview';

export type ReviewTransition = (review: PageReview) => PageReview;

/**
 * Owns review state for every page.
 *
 * Two layers:
 *  - `initialReviews`: what was persisted (project pages hydrate from
 *    `document_pages.review_state`). Read-only, may arrive/change over time.
 *  - `overrides`: everything changed locally this session.
 *
 * `reviews` is the merge (overrides win). Because hydration is a derived read
 * rather than an action, there's no window where a persisted page looks
 * "unscanned" and gets re-scanned.
 *
 * Whenever an override changes identity, `onReviewChange(pageKey, review)`
 * fires once for that page. Hydrated pages never trigger it.
 */
export function useReviewStore(
  initialReviews: ReviewsByPage | undefined,
  onReviewChange?: (pageKey: string, review: PageReview) => void
) {
  const [overrides, setOverrides] = useState<ReviewsByPage>({});

  const initialRef = useRef(initialReviews);
  const onChangeRef = useRef(onReviewChange);
  useEffect(() => {
    initialRef.current = initialReviews;
    onChangeRef.current = onReviewChange;
  });

  const reviews = useMemo<ReviewsByPage>(
    () => ({ ...initialReviews, ...overrides }),
    [initialReviews, overrides]
  );

  /** Replace a page's review wholesale (used by scans). */
  const putReview = useCallback((pageKey: string, review: PageReview) => {
    setOverrides((prev) => ({ ...prev, [pageKey]: review }));
  }, []);

  /**
   * Apply a pure transition to a page's current review. Falls back to the
   * hydrated review when there's no local override yet. No-op transitions
   * (returning the same object) don't touch state, so nothing is persisted.
   */
  const updateReview = useCallback((pageKey: string, transition: ReviewTransition) => {
    setOverrides((prev) => {
      const base = prev[pageKey] ?? initialRef.current?.[pageKey];
      if (!base) return prev;
      const next = transition(base);
      return next === base ? prev : { ...prev, [pageKey]: next };
    });
  }, []);

  // Persist exactly the pages whose review object changed since last flush.
  const flushedRef = useRef<ReviewsByPage>({});
  useEffect(() => {
    Object.entries(overrides).forEach(([pageKey, review]) => {
      if (flushedRef.current[pageKey] !== review) onChangeRef.current?.(pageKey, review);
    });
    flushedRef.current = overrides;
  }, [overrides]);

  return { reviews, putReview, updateReview };
}
