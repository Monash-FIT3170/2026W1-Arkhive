import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ExtractedPage } from '../models/TableData';
import type { ReviewField } from '../models/Message';
import type { HistoryEntry } from '../models/HistoryEntry';
import type { OcrIssue } from '../models/IssueReview';
import {
  requestBulkFieldReview,
  requestFieldReview,
  requestFormatDetection,
} from '../services/llmService';
import { detectReviewFields } from '../utils/detectReviewFields';
import { checkTableFormats } from '../utils/detectFormat';

interface UseReviewQueueOptions {
  extractedPages: ExtractedPage[];
  currentPageIndex: number;
  // Always-current pages, read synchronously inside callbacks (a ref, not
  // state, so async handlers never act on a stale snapshot).
  extractedPagesRef: RefObject<ExtractedPage[]>;
  // Applies an update across all pages, however the caller stores them.
  // ValidationPage passes setExtractedPages directly; a future per-document
  // workspace would pass an adapter built on top of its own update function.
  onPagesChange: (updater: (pages: ExtractedPage[]) => ExtractedPage[]) => void;
  onPersist: (pages: ExtractedPage[]) => void;
  addHistoryEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  // Optional: wire into an undo stack. Omit if the caller doesn't support undo.
  pushUndo?: (snapshot: ExtractedPage[]) => void;
  // Fires once, the first time detection finds any issues — e.g. to switch a
  // chat panel over to its "review" tab.
  onIssuesDetected?: () => void;
}

export function useReviewQueue({
  extractedPages,
  currentPageIndex,
  extractedPagesRef,
  onPagesChange,
  onPersist,
  addHistoryEntry,
  pushUndo,
  onIssuesDetected,
}: UseReviewQueueOptions) {
  const [flaggedIssues, setFlaggedIssues] = useState<OcrIssue[]>([]);
  const [resolvedIssueIds, setResolvedIssueIds] = useState<Set<string>>(new Set());
  const hasStartedRef = useRef(false);

  const handleResolveIssues = useCallback((ids: string[]) => {
    setResolvedIssueIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  // Runs once, right after pages first load: flags low-confidence fields and
  // fields whose values don't match the column's inferred format.
  useEffect(() => {
    async function performFormatDetection() {
      if (extractedPages.length === 0 || hasStartedRef.current) return;
      hasStartedRef.current = true;

      let allIssues: OcrIssue[] = [];

      for (let pageIdx = 0; pageIdx < extractedPages.length; pageIdx++) {
        const pageContext = extractedPages[pageIdx];

        const fields = detectReviewFields(pageContext);
        const confidenceIssues: OcrIssue[] = fields.map((f) => ({
          fieldId: `${f.rowId}:${f.column}`,
          fieldName: f.column,
          ocrValue: String(f.value),
          confidenceScore: f.confidence,
          issueType: 'confidence',
          rowId: f.rowId,
          pageIndex: pageIdx,
        }));

        const sampledData: Record<string, string[]> = {};
        const maxSamples = 20;

        for (const col of pageContext.columns) {
          const cleanValues = pageContext.rows
            .map((row) => row[col])
            .filter(
              (val): val is string => val !== null && val !== undefined && String(val).trim() !== ''
            )
            .map((val) => String(val).trim());

          if (cleanValues.length > 0) {
            if (cleanValues.length <= maxSamples) {
              sampledData[col] = cleanValues;
            } else {
              const step = Math.floor(cleanValues.length / maxSamples);
              sampledData[col] = cleanValues
                .filter((_, idx) => idx % step === 0)
                .slice(0, maxSamples);
            }
          }
        }

        let formatIssues: OcrIssue[] = [];
        let columnRegexMap: Record<string, string> = {};
        try {
          if (Object.keys(sampledData).length > 0) {
            columnRegexMap = await requestFormatDetection(sampledData);
            formatIssues = checkTableFormats(pageContext, columnRegexMap).map((f) => ({
              fieldId: `${f.rowId}:${f.column}`,
              fieldName: f.column,
              ocrValue: String(f.value),
              confidenceScore: 0.3, // fallback confidence score for format issues
              issueType: 'format' as const,
              rowId: f.rowId,
              pageIndex: pageIdx,
            }));
          }
        } catch (error) {
          console.error('Failed to detect format issues on page ' + pageIdx, error);
        }

        const byColumn = formatIssues.reduce<Record<string, OcrIssue[]>>((acc, issue) => {
          (acc[issue.fieldName] ??= []).push(issue);
          return acc;
        }, {});

        Object.entries(byColumn).forEach(([column, colIssues]) => {
          if (colIssues.length > 1) {
            const groupId = `format:${column}:page${pageIdx}`;
            colIssues.forEach((issue) => {
              issue.groupId = groupId;
              issue.formatRegex = columnRegexMap[column];
            });
          }
        });

        allIssues = allIssues.concat(confidenceIssues, formatIssues);
      }

      setFlaggedIssues(allIssues);
      if (allIssues.length > 0) {
        onIssuesDetected?.();
      }
    }

    performFormatDetection();
  }, [extractedPages, onIssuesDetected]);

  const handleCarouselAccept = useCallback(
    (updates: { fieldId: string; newValue: string }[]) => {
      onPagesChange((prev) => {
        const next = [...prev];
        updates.forEach(({ fieldId, newValue }) => {
          const [rowId, column] = fieldId.split(':');
          const issue = flaggedIssues.find((i) => i.fieldId === fieldId);
          const pageIdx = issue?.pageIndex ?? currentPageIndex;
          next[pageIdx] = {
            ...next[pageIdx],
            rows: next[pageIdx].rows.map((r) =>
              String(r._id) === String(rowId) ? { ...r, [column]: newValue } : r
            ),
          };
        });
        return next;
      });

      updates.forEach(({ fieldId, newValue }) => {
        const [rowId, column] = fieldId.split(':');
        const issue = flaggedIssues.find((i) => i.fieldId === fieldId);
        const pageIdx = issue?.pageIndex ?? currentPageIndex;

        const currentRow = extractedPagesRef.current[pageIdx]?.rows.find(
          (r) => String(r._id) === String(rowId)
        );
        const oldValue = currentRow ? String(currentRow[column] ?? '') : '';

        addHistoryEntry({
          type: 'accept',
          pageIndex: pageIdx,
          fieldId,
          column,
          oldValue,
          newValue,
          description: `Accepted correction for "${column}" on page ${pageIdx + 1}: "${oldValue}" to "${newValue}"`,
        });
      });

      onPersist(extractedPagesRef.current);
      const fieldIds = updates.map(({ fieldId }) => fieldId);
      setFlaggedIssues((prev) => prev.filter((issue) => !fieldIds.includes(issue.fieldId)));
    },
    [flaggedIssues, currentPageIndex, extractedPagesRef, onPagesChange, onPersist, addHistoryEntry]
  );

  const handleCarouselReject = useCallback(
    (fieldIds: string[]) => {
      fieldIds.forEach((fieldId) => {
        const issue = flaggedIssues.find((i) => i.fieldId === fieldId);
        addHistoryEntry({
          type: 'skip',
          pageIndex: issue?.pageIndex,
          fieldId,
          column: issue?.fieldName,
          oldValue: issue?.ocrValue,
          description: `Skipped "${issue?.fieldName}" on page ${(issue?.pageIndex ?? 0) + 1}: "${issue?.ocrValue}"`,
        });
      });

      setFlaggedIssues((prev) => prev.filter((issue) => !fieldIds.includes(issue.fieldId)));
    },
    [flaggedIssues, addHistoryEntry]
  );

  const handleCarouselManualEdit = useCallback(
    (fieldId: string, newValue: string) => {
      pushUndo?.(extractedPagesRef.current);

      const [rowId, column] = fieldId.split(':');
      const issue = flaggedIssues.find((i) => i.fieldId === fieldId);
      const pageIdx = issue?.pageIndex ?? currentPageIndex;

      const currentRow = extractedPagesRef.current[pageIdx]?.rows.find(
        (r) => String(r._id) === String(rowId)
      );
      const oldValue = currentRow ? String(currentRow[column] ?? '') : '';

      addHistoryEntry({
        type: 'edit',
        pageIndex: pageIdx,
        fieldId,
        column,
        oldValue,
        newValue,
        description: `Manually corrected "${column}" on page ${pageIdx + 1}: "${oldValue}" to "${newValue}"`,
      });

      onPagesChange((prev) =>
        prev.map((page, i) => {
          if (i !== pageIdx) return page;
          return {
            ...page,
            rows: page.rows.map((r) =>
              String(r._id) === String(rowId) ? { ...r, [column]: newValue } : r
            ),
          };
        })
      );

      onPersist(extractedPagesRef.current);
      setFlaggedIssues((prev) => prev.filter((issue) => issue.fieldId !== fieldId));
    },
    [
      flaggedIssues,
      currentPageIndex,
      extractedPagesRef,
      pushUndo,
      onPagesChange,
      onPersist,
      addHistoryEntry,
    ]
  );

  const handleFetchSuggestion = useCallback(
    async (fieldId: string) => {
      const documentContext = extractedPages[currentPageIndex];
      if (!documentContext) return null;
      const [rowId, column] = fieldId.split(':');
      const issue = flaggedIssues.find((i) => i.fieldId === fieldId);
      if (!issue) return null;

      const field: ReviewField = {
        rowId,
        column,
        value: issue.ocrValue,
        confidence: issue.confidenceScore,
        issueType: issue.issueType,
      };

      try {
        const reply = await requestFieldReview(field, documentContext);
        if (reply.intent?.newValue) {
          return reply.intent.newValue;
        }
        if (reply.updatedContext) {
          const updatedRow = reply.updatedContext.rows.find(
            (r) => r._id === rowId || String(r._id) === rowId
          );
          if (updatedRow && updatedRow[column] !== undefined) {
            return String(updatedRow[column]);
          }
        }
        return reply.response;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    [extractedPages, currentPageIndex, flaggedIssues]
  );

  const handleFetchBulkSuggestion = useCallback(
    async (
      column: string,
      fields: { fieldId: string; rowId: string | number; ocrValue: string }[],
      formatRegex?: string
    ): Promise<Record<string, string> | null> => {
      const documentContext = extractedPages[currentPageIndex];
      if (!documentContext) return null;

      const reviewFields: ReviewField[] = fields.map((f) => {
        const issue = flaggedIssues.find((i) => i.fieldId === f.fieldId);
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
          documentContext,
        });

        const map: Record<string, string> = {};

        if (reply.intent?.type === 'bulk_update' && reply.intent.bulkUpdates) {
          reply.intent.bulkUpdates.forEach((u) => {
            map[String(u.rowId)] = u.newValue;
          });
        }

        if (reply.updatedContext) {
          fields.forEach(({ rowId }) => {
            if (map[String(rowId)] !== undefined) return;
            const updatedRow = reply.updatedContext!.rows.find(
              (r) => r._id === rowId || String(r._id) === String(rowId)
            );
            if (updatedRow && updatedRow[column] !== undefined) {
              map[String(rowId)] = String(updatedRow[column]);
            }
          });
        }

        return Object.keys(map).length > 0 ? map : null;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    [extractedPages, currentPageIndex, flaggedIssues]
  );

  return {
    flaggedIssues,
    setFlaggedIssues,
    resolvedIssueIds,
    handleResolveIssues,
    handleCarouselAccept,
    handleCarouselReject,
    handleCarouselManualEdit,
    handleFetchSuggestion,
    handleFetchBulkSuggestion,
  };
}
