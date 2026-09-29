// Acknowledgement: Google Gemini was used to help generate this file

import type { OcrIssue, ReviewSlide } from '../models/IssueReview';

// Function that turns each OCR Issue to a equivalent ReviewSlide format
export function buildSlides(issues: OcrIssue[]): ReviewSlide[] {
  const slides: ReviewSlide[] = [];
  const seenGroups = new Set<string>();

  for (const issue of issues) {
    if (issue.groupId) {
      // Group Issues together
      if (seenGroups.has(issue.groupId)) continue;
      seenGroups.add(issue.groupId);
      slides.push({
        kind: 'group',
        groupId: issue.groupId,
        fieldName: issue.fieldName,
        formatRegex: issue.formatRegex,
        issues: issues.filter((i) => i.groupId === issue.groupId),
      });
    } else {
      // Else single
      slides.push({ kind: 'single', issue });
    }
  }
  return slides;
}
