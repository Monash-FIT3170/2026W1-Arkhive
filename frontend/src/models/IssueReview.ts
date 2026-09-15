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
