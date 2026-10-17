import { useCallback, type RefObject } from 'react';
import type { ExtractedData, ExtractedPage } from '../../models/TableData';
import type { ReviewField } from '../../models/Message';
import type { ReviewsByPage } from '../../models/IssueReview';
import { requestBulkFieldReview, requestFieldReview } from '../../services/llmService';
import { parseFieldId } from '../../utils/keys';
import { findOpenIssue } from '../../utils/review/reviewState';

interface UseReviewSuggestionsOptions {
  pageKeys: readonly string[];
  reviews: ReviewsByPage;
  pagesRef: RefObject<ExtractedPage[]>;
  pageIndexRef: RefObject<number>;
}

type BulkReply = Awaited<ReturnType<typeof requestBulkFieldReview>>;

/** The grid for a tableId on a page (the active grid when omitted / equal to page.tableId). */
function gridOf(page: ExtractedPage | undefined, tableId?: string): ExtractedData | undefined {
  if (!page) return undefined;
  if (!tableId || tableId === page.tableId) return page;
  return page.otherTables?.find((t) => t.tableId === tableId);
}

/** Looks a cell up in an LLM-returned page context, in the right table. */
function findUpdatedCell(
  context: ExtractedPage | undefined,
  tableId: string | undefined,
  rowId: string | number,
  column: string
): string | undefined {
  const row = gridOf(context, tableId)?.rows.find((r) => String(r._id) === String(rowId));
  return row && row[column] !== undefined ? String(row[column]) : undefined;
}

/** rowId -> suggested value, from either explicit bulk updates or the updated context. */
function collectBulkSuggestions(
  reply: BulkReply,
  tableId: string | undefined,
  rowIds: readonly (string | number)[],
  column: string
): Record<string, string> {
  const fromIntent =
    reply.intent?.type === 'bulk_update' && reply.intent.bulkUpdates
      ? Object.fromEntries(reply.intent.bulkUpdates.map((u) => [String(u.rowId), u.newValue]))
      : {};

  const fromContext = Object.fromEntries(
    rowIds
      .filter((id) => fromIntent[String(id)] === undefined)
      .flatMap((id) => {
        const value = findUpdatedCell(reply.updatedContext, tableId, id, column);
        return value === undefined ? [] : [[String(id), value] as const];
      })
  );

  return { ...fromContext, ...fromIntent };
}

export function useReviewSuggestions({
  pageKeys,
  reviews,
  pagesRef,
  pageIndexRef,
}: UseReviewSuggestionsOptions) {
  const handleFetchSuggestion = useCallback(
    async (fieldId: string): Promise<string | null> => {
      const pageIndex = pageIndexRef.current;
      const page = pagesRef.current[pageIndex];
      const issue = findOpenIssue(reviews[pageKeys[pageIndex]], fieldId);
      if (!page || !issue) return null;

      const { rowId, column } = parseFieldId(fieldId);
      // Review issues come from the grid on screen, which is the page's active table.
      const tableId = page.tableId;
      const field: ReviewField = {
        tableId,
        rowId,
        column,
        value: issue.ocrValue,
        confidence: issue.confidenceScore,
        issueType: issue.issueType,
      };

      try {
        const reply = await requestFieldReview(field, page);
        if (reply.intent?.newValue != null) return reply.intent.newValue;
        // Never fall back to reply.response: it is prose, and accepting it would write a sentence into the cell.
        return findUpdatedCell(reply.updatedContext, tableId, rowId, column) ?? null;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    [pageKeys, reviews, pagesRef, pageIndexRef]
  );

  const handleFetchBulkSuggestion = useCallback(
    async (
      column: string,
      fields: { fieldId: string; rowId: string | number; ocrValue: string }[],
      formatRegex?: string
    ): Promise<Record<string, string> | null> => {
      const pageIndex = pageIndexRef.current;
      const page = pagesRef.current[pageIndex];
      if (!page) return null;

      const tableId = page.tableId;
      const review = reviews[pageKeys[pageIndex]];
      const reviewFields: ReviewField[] = fields.map((f) => {
        const issue = findOpenIssue(review, f.fieldId);
        return {
          tableId,
          rowId: f.rowId,
          column,
          value: f.ocrValue,
          confidence: issue?.confidenceScore ?? 0.3,
          issueType: issue?.issueType ?? 'format',
        };
      });

      try {
        const reply = await requestBulkFieldReview({
          tableId,
          column,
          fields: reviewFields,
          formatRegex,
          documentContext: page,
        });
        const suggestions = collectBulkSuggestions(
          reply,
          tableId,
          fields.map((f) => f.rowId),
          column
        );
        return Object.keys(suggestions).length > 0 ? suggestions : null;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    [pageKeys, reviews, pagesRef, pageIndexRef]
  );

  return { handleFetchSuggestion, handleFetchBulkSuggestion };
}
