import { useCallback, type RefObject } from 'react';
import type { ExtractedPage } from '../../models/TableData';
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

/** Looks a cell up in an LLM-returned page context. */
function findUpdatedCell(
  context: ExtractedPage | undefined,
  rowId: string | number,
  column: string
): string | undefined {
  const row = context?.rows.find((r) => String(r._id) === String(rowId));
  return row && row[column] !== undefined ? String(row[column]) : undefined;
}

/** rowId -> suggested value, from either explicit bulk updates or the updated context. */
function collectBulkSuggestions(
  reply: BulkReply,
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
        const value = findUpdatedCell(reply.updatedContext, id, column);
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
      const field: ReviewField = {
        rowId,
        column,
        value: issue.ocrValue,
        confidence: issue.confidenceScore,
        issueType: issue.issueType,
      };

      try {
        const reply = await requestFieldReview(field, page);
        if (reply.intent?.newValue) return reply.intent.newValue;
        return findUpdatedCell(reply.updatedContext, rowId, column) ?? reply.response;
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

      const review = reviews[pageKeys[pageIndex]];
      const reviewFields: ReviewField[] = fields.map((f) => {
        const issue = findOpenIssue(review, f.fieldId);
        return {
          rowId: f.rowId,
          column,
          value: f.ocrValue,
          confidence: issue?.confidenceScore ?? 0.3,
          issueType: issue?.issueType ?? 'format',
        };
      });

      try {
        const reply = await requestBulkFieldReview({
          column,
          fields: reviewFields,
          formatRegex,
          documentContext: page,
        });
        const suggestions = collectBulkSuggestions(
          reply,
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
