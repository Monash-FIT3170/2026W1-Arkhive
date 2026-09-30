import type { ExtractedPage } from '../../models/TableData';
import type { PageReview, StoredIssue } from '../../models/IssueReview';
import { detectReviewFields } from './detectReviewFields';
import { checkTableFormats } from './detectFormat';
import { makeFieldId } from '../keys';

const MAX_FORMAT_SAMPLES = 20;
const FORMAT_ISSUE_CONFIDENCE = 0.3;

/** Given sampled column values, returns a regex (as a string) per column. */
export type DetectFormats = (samples: Record<string, string[]>) => Promise<Record<string, string>>;

function evenlySample<T>(values: readonly T[], max: number): T[] {
  if (values.length <= max) return [...values];
  const step = Math.floor(values.length / max);
  return values.filter((_, i) => i % step === 0).slice(0, max);
}

/** Non-empty, trimmed values per column, capped so the LLM prompt stays small. */
export function sampleColumnValues(
  page: ExtractedPage,
  max: number = MAX_FORMAT_SAMPLES
): Record<string, string[]> {
  const entries = page.columns
    .map((column) => {
      const clean = page.rows
        .map((row) => row[column])
        .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
        .map((v) => String(v).trim());
      return [column, evenlySample(clean, max)] as const;
    })
    .filter(([, values]) => values.length > 0);

  return Object.fromEntries(entries);
}

export function confidenceIssues(page: ExtractedPage): StoredIssue[] {
  return detectReviewFields(page).map((f) => ({
    fieldId: makeFieldId(f.rowId, f.column),
    fieldName: f.column,
    ocrValue: String(f.value),
    confidenceScore: f.confidence,
    issueType: 'confidence' as const,
    rowId: f.rowId,
  }));
}

/**
 * Flags cells that don't match their column's inferred format. When a column
 * has several offenders they share a `groupId` (so the widget can offer one
 * bulk-fix slide) and carry the regex that flagged them.
 */
export function formatIssues(
  page: ExtractedPage,
  regexByColumn: Record<string, string>,
  pageKey: string
): StoredIssue[] {
  const flagged: StoredIssue[] = checkTableFormats(page, regexByColumn).map((f) => ({
    fieldId: makeFieldId(f.rowId, f.column),
    fieldName: f.column,
    ocrValue: String(f.value),
    confidenceScore: FORMAT_ISSUE_CONFIDENCE,
    issueType: 'format' as const,
    rowId: f.rowId,
  }));

  const countByColumn = new Map<string, number>();
  flagged.forEach((i) => countByColumn.set(i.fieldName, (countByColumn.get(i.fieldName) ?? 0) + 1));

  return flagged.map((issue) =>
    (countByColumn.get(issue.fieldName) ?? 0) > 1
      ? {
          ...issue,
          groupId: `format:${issue.fieldName}:${pageKey}`,
          formatRegex: regexByColumn[issue.fieldName],
        }
      : issue
  );
}

async function detectFormatIssues(
  page: ExtractedPage,
  pageKey: string,
  detectFormats: DetectFormats
): Promise<{ ok: boolean; issues: StoredIssue[] }> {
  const samples = sampleColumnValues(page);
  if (Object.keys(samples).length === 0) return { ok: true, issues: [] };

  try {
    const regexByColumn = await detectFormats(samples);
    return { ok: true, issues: formatIssues(page, regexByColumn, pageKey) };
  } catch (error) {
    console.error(`Format detection failed for page ${pageKey}`, error);
    return { ok: false, issues: [] };
  }
}

/**
 * Scans one page and returns its complete review. The only side effect is the
 * injected `detectFormats` call, which makes this trivially testable.
 */
export async function scanPage(
  page: ExtractedPage,
  pageKey: string,
  detectFormats: DetectFormats,
  now: () => Date = () => new Date()
): Promise<PageReview> {
  const format = await detectFormatIssues(page, pageKey, detectFormats);
  return {
    version: 1,
    scannedAt: now().toISOString(),
    formatCheckOk: format.ok,
    issues: [...confidenceIssues(page), ...format.issues],
  };
}
