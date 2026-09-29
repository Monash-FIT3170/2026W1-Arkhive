import type { OcrIssue } from '../../models/IssueReview';
import type {
  IssueResolution,
  PageReview,
  ReviewsByPage,
  StoredIssue,
} from '../../models/IssueReview';
import { makeFieldId } from '../keys';

// ── Selectors ────────────────────────────────────────────────────────────────

const isOpen = (issue: StoredIssue): boolean => issue.resolution === undefined;

export const openIssues = (review: PageReview | undefined): StoredIssue[] =>
  (review?.issues ?? []).filter(isOpen);

export const findOpenIssue = (
  review: PageReview | undefined,
  fieldId: string
): StoredIssue | undefined => openIssues(review).find((i) => i.fieldId === fieldId);

/**
 * Every open issue across all pages, in page order, with `pageIndex` derived
 * from where each page currently sits. This is what the review widget renders.
 */
export const flattenOpenIssues = (
  pageKeys: readonly string[],
  reviews: ReviewsByPage
): OcrIssue[] =>
  pageKeys.flatMap((key, pageIndex) =>
    openIssues(reviews[key]).map((issue) => ({ ...issue, pageIndex }))
  );

// ── Transitions (PageReview -> PageReview, referentially stable on no-ops) ──

export function resolveIssues(
  review: PageReview,
  fieldIds: readonly string[],
  resolution: IssueResolution
): PageReview {
  const targets = new Set(fieldIds);
  const affected = (i: StoredIssue) => isOpen(i) && targets.has(i.fieldId);
  if (!review.issues.some(affected)) return review;

  return {
    ...review,
    issues: review.issues.map((i) => (affected(i) ? { ...i, resolution } : i)),
  };
}

export function renameColumn(review: PageReview, from: string, to: string): PageReview {
  if (!review.issues.some((i) => i.fieldName === from)) return review;

  return {
    ...review,
    issues: review.issues.map((i) =>
      i.fieldName === from ? { ...i, fieldName: to, fieldId: makeFieldId(i.rowId, to) } : i
    ),
  };
}
