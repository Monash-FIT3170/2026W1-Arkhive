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
