import { Shapes, Gauge, type LucideIcon } from 'lucide-react';

export interface OcrIssue {
  fieldId: string;
  fieldName: string;
  ocrValue: string;
  confidenceScore: number;
  issueType?: 'confidence' | 'format';
  rowId: string | number;
  groupId?: string; //  shared by cells that should be resolved together
  formatRegex?: string; // the detected regex for this column, if any
  pageIndex?: number;
}

// The type of slide for review
export type ReviewSlide =
  | { kind: 'single'; issue: OcrIssue }
  | { kind: 'group'; groupId: string; fieldName: string; formatRegex?: string; issues: OcrIssue[] };

/** How an issue left the review queue. Absent on the issue = still open. */
export type IssueResolution = 'accepted' | 'rejected' | 'edited';

/**
 * An issue as persisted. `pageIndex` is deliberately absent: it is the page's
 * position in the *current* workspace array, which shifts when pages are added
 * or removed. Persisted issues hang off a page key instead, and `pageIndex` is
 * re-derived when issues are flattened for display.
 */
export type StoredIssue = Omit<OcrIssue, 'pageIndex'> & {
  resolution?: IssueResolution;
};

/** Everything we remember about scanning + reviewing one page. */
export interface PageReview {
  version: 1;
  /** ISO timestamp of the scan that produced `issues`. A PageReview existing at all means "this page has been scanned". */
  scannedAt: string;
  /**
   * False when the LLM format check errored, so only confidence issues are
   * present. Lets the UI nudge the user to re-scan instead of silently
   * treating a half-scan as a clean bill of health.
   */
  formatCheckOk: boolean;
  issues: StoredIssue[];
}

/**
 * Keyed by page key: `${documentId}:${pageIndex}` in projects, or a plain
 * index string in quick scan.
 */
export type ReviewsByPage = Readonly<Record<string, PageReview>>;

/**
 * Issue Type UI Meta Data
 */

/** Derived from the model, so adding a new issue type there forces an entry below. */
export type IssueType = NonNullable<OcrIssue['issueType']>;

export interface IssueTypeMeta {
  /** Short name shown in the badge. */
  label: string;
  Icon: LucideIcon;
  /**
   * Full class strings (not built dynamically) so Tailwind can see them.
   * Only the border and icon use the status colour; text stays `base-content`
   * so contrast is safe on any daisyUI theme, including Nord's pale yellows.
   */
  borderClass: string;
  iconClass: string;
  /** One sentence, shown in the tooltip. Keep it short. */
  tip: string;
}

export const ISSUE_TYPES: Record<IssueType, IssueTypeMeta> = {
  confidence: {
    label: 'Low confidence',
    Icon: Gauge,
    borderClass: 'border-warning',
    iconClass: 'text-warning',
    tip: "OCR wasn't sure it read this correctly. Flagged when its score is under 60% or well below the page average.",
  },
  format: {
    label: 'Format mismatch',
    Icon: Shapes,
    borderClass: 'border-secondary',
    iconClass: 'text-secondary',
    tip: "Doesn't match the format most values in this column share, as worked out by AI.",
  },
};
