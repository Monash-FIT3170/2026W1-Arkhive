import { useState, useEffect, useRef, useCallback } from 'react';
import DocumentPanel from './components/document/DocumentPanel';
import ExtractedDataPanel from './components/extracted-data/ExtractedDataPanel';
import ChatPanel from './components/chat/ChatPanel';
import type { ChatMessage, ReviewField } from '../../models/Message';
import type { OCRComponent, Pages } from '../../models/OCRComponent';
import type {ExtractedPage } from '../../models/TableData';
import { getProcessedImageUrls, getUploadedImageUrl } from '../../services/uploadService';
import type { DocumentJob } from '../../models/Job';
import {
  getExtractionSession,
  saveExtractionSession,
} from '../../services/extractionService';
import { detectReviewFields } from './components/extracted-data/detectReviewFields';
import {
  requestBulkFieldReview,
  requestFieldReview,
  requestFormatDetection,
} from '../../services/llmService';
import type { OcrIssue } from './components/chat/OcrReviewWidget';
import { flatten } from './components/extracted-data/flattener';
import { checkTableFormats } from './components/extracted-data/detectFormat';

import type { HistoryEntry } from '../HistoryEntry';

function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsLarge(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isLarge;
}

function ValidationPage() {
  //const [jobs, setJobs] = useState<DocumentJob[]>([]);
  //const [activeJobIndex, setActiveJobIndex] = useState<number>(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [splitPercent, setSplitPercent] = useState(50);
  const [oldContext, setOldContext] = useState<ExtractedPage | null>(null); //for AI suggesiton
  const [imageUrls, setImageUrls] = useState<string[]>([]); // one image URL per page
  const [ocrPages, setOcrPages] = useState<Pages>([]); // raw OCR, one array per page
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>([]); // flattened, one per page
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const documentContext: ExtractedPage | null = extractedPages[currentPageIndex] ?? null;
  const ocrData: OCRComponent[] = ocrPages[currentPageIndex]?.components ?? [];
  const documentImageURL: string | undefined = imageUrls[currentPageIndex];

  const isLarge = useIsLargeScreen();
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<ExtractedPage[][]>([]);
  const redoStack = useRef<ExtractedPage[][]>([]);

  const [tableKey, setTableKey] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());
  const [flaggedIssues, setFlaggedIssues] = useState<OcrIssue[]>([]);
  const [chatActiveTab, setChatActiveTab] = useState<'chat' | 'review' | 'history'>('chat');
  const [manualIndentLevels, setManualIndentLevels] = useState<
    Record<number, Record<string, number>>
  >({});

  const extractedPagesRef = useRef<ExtractedPage[]>([]);
  const currentPageIndexRef = useRef(0);
  useEffect(() => {
    extractedPagesRef.current = extractedPages;
  }, [extractedPages]);
  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

  const [resolvedIssueIds, setResolvedIssueIds] = useState<Set<string>>(new Set());

  const handleResolveIssues = (ids: string[]) => {
    setResolvedIssueIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const addHistoryEntry = (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setHistory((prev) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  useEffect(() => {
    async function loadSession() {
      try {
        // const batchData = await getBatchJobs().catch(() => null);

        // if (batchData && batchData.jobs && batchData.jobs.length > 0) {
        //   setJobs(batchData.jobs);
        //   const initialIndex = batchData.activeJobIndex ?? 0;
        //   setActiveJobIndex(initialIndex);

        //   const activeJob = batchData.jobs[initialIndex] || batchData.jobs[0];
        //   setOCRData(activeJob.ocrData || []);
        //   setDocumentImageURL(getUploadedImageUrl(activeJob.imageIndex ?? initialIndex));

        //   const initialTable =
        //     activeJob.extractedData || flatten(activeJob.ocrData as OCRComponent[]);
        //   setDocumentContext(initialTable);
        //   return;
        // }

        const ocrData = await getExtractionSession(); //IMORTANT NOTE, CHANGE API TO NEW ONE
        setOcrPages(ocrData);
        // console.log("SESSION DATA:", sessionData);
        // console.log("OCR DATA:", sessionData?.ocrData);
        // if (!sessionData?.ocrData) {
        //   sessionData = await saveExtractionSession(mockOcrData); // initialize with mock if no session exists
        // }
        const processedUrls = await getProcessedImageUrls();
        console.log(processedUrls);
        setImageUrls(processedUrls.length > 0 ? processedUrls : [await getUploadedImageUrl()]);
      } catch (error) {
        console.error('Failed to load extraction session', error);
      }
    }
    loadSession();
  }, []);

  // re-flatten ALL pages whenever the raw OCR data or any page's
  // manual indent overrides change. This is the single source of truth for
  // extractedPages — nothing else should call flatten() directly
  useEffect(() => {
    if (ocrPages.length === 0) return;
    const newExtractedPages: ExtractedPage[] = ocrPages.map((page, pageIndex) => ({
      ...flatten(page.components, { manualIndentLevels: manualIndentLevels[pageIndex] ?? {} }),
      pageIndex: page.page_num - 1,
    }));
    setExtractedPages(newExtractedPages);
  }, [ocrPages, manualIndentLevels]);

  const hasStartedRef = useRef(false);

  useEffect(() => {
    async function performFormatDetection() {
      if (extractedPages.length === 0 || hasStartedRef.current) return;
      hasStartedRef.current = true;

      let allIssues: OcrIssue[] = [];

      for (let pageIdx = 0; pageIdx < extractedPages.length; pageIdx++) {
        const pageContext = extractedPages[pageIdx];

        // Low Confidence Detection
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

        // Randomly sample 10–30 non-empty values per column for format detection.
        const sampledData: Record<string, string[]> = {};
        const sampleSize = Math.min(30, Math.max(10, Math.ceil(pageContext.rows.length * 0.1)));

        for (const col of pageContext.columns) {
          const values: string[] = [];
          for (const row of pageContext.rows) {
            const val = row[col];
            if (val !== null && val !== undefined && String(val).trim() !== '') {
              values.push(String(val).trim());
            }
          }
          const shuffled = values.sort(() => Math.random() - 0.5);
          const samples = shuffled.slice(0, sampleSize);
          if (samples.length > 0) {
            sampledData[col] = samples;
          }
        }

        let formatIssues: OcrIssue[] = [];
        let columnRegexMap: Record<string, string> = {};
        try {
          // If we have no sampled data, no need to request format detection
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

        // Group format issues by column.
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
        setChatActiveTab('review');
      }
    }

    performFormatDetection();
  }, [extractedPages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUndo = e.metaKey && e.key === 'z' && !e.shiftKey;
      const isRedo = e.metaKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey));

      if (isUndo) {
        e.preventDefault();
        if (undoStack.current.length === 0) return;

        const previous = undoStack.current.pop()!;
        redoStack.current.push(extractedPagesRef.current);

        setExtractedPages(previous);
        saveExtractionSession(previous);
        setEditedCells(new Set());
        setTableKey((k) => k + 1);
        addHistoryEntry({
          type: 'undo',
          description: 'Undid last change',
        });
      }

      if (isRedo) {
        e.preventDefault();
        if (redoStack.current.length === 0) return;

        const next = redoStack.current.pop()!;
        undoStack.current.push(extractedPagesRef.current);

        setExtractedPages(next);
        saveExtractionSession(next);
        setEditedCells(new Set());
        setTableKey((k) => k + 1);
        addHistoryEntry({
          type: 'redo',
          description: 'Redid last change',
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  //Resizing Functions
  //Set dragging to be true
  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  //Given mouse even that is moving, we calculate the presentage of mouse relative to container size
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percent = (offsetX / rect.width) * 100;

    // Clamp between 20% and 80%
    setSplitPercent(Math.min(80, Math.max(20, percent)));
  }, []);

  //On mouse up, we set dragging to be false
  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  //bounding box hover state
  const [hoveredTableFieldIds, setHoveredTableFieldIds] = useState<string[]>([]);
  const [hoveredDocumentOverlayIds, setHoveredDocumentOverlayIds] = useState<string[]>([]);

  const handleSlideChange = useCallback((fieldIds: string[], pageIndex?: number) => {
    setHoveredTableFieldIds(fieldIds);

    if (pageIndex !== undefined && pageIndex !== currentPageIndexRef.current) {
      setCurrentPageIndex(pageIndex);
    }

    const contextPageIndex = pageIndex !== undefined ? pageIndex : currentPageIndexRef.current;
    const currentContext = extractedPagesRef.current[contextPageIndex];

    if (fieldIds.length === 0 || !currentContext) {
      setHoveredDocumentOverlayIds([]);
      return;
    }

    const overlayIds = fieldIds
      .map((fieldId) => {
        const [rowId, column] = fieldId.split(':');
        const row = currentContext.rows.find((r) => String(r._id) === rowId);
        return row?._cellKeyMap?.[column];
      })
      .filter((id): id is string => Boolean(id));

    setHoveredDocumentOverlayIds(overlayIds);
  }, []);

  const addMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  // called when AI returns updatedContext after accepting suggestion
  const handleContextUpdate = (updatedData: ExtractedPage) => {
    setOldContext(documentContext);
    setExtractedPages((prev) =>
      prev.map((page, i) => (i === currentPageIndex ? updatedData : page))
    );
  };

  const resolveLastMessage = () => {
    setMessages((prev) =>
      prev.map((msg, i) => (i === prev.length - 1 ? { ...msg, resolved: true } : msg))
    );
  };

  //handle accept
  const handleAccept = async () => {
    if (!documentContext) return;
    try {
      await saveExtractionSession(extractedPages);
    } catch (error) {
      console.error('Failed to save session after accept', error);
    }
    setOldContext(null);
    resolveLastMessage();
    addMessage({
      id: crypto.randomUUID(),
      role: 'model',
      content: 'Got it! The changes have been applied and saved.',
      timestamp: new Date().toISOString(),
    });
  };

  //handle reject
  const handleReject = () => {
    if (!oldContext) return;
    setExtractedPages((prev) =>
      prev.map((page, i) => (i === currentPageIndex ? oldContext : page))
    );
    setOldContext(null);
    resolveLastMessage();
    addMessage({
      id: crypto.randomUUID(),
      role: 'model',
      content: 'No problem, the changes have been reverted.',
      timestamp: new Date().toISOString(),
    });
  };

  //Handle Row Indent
  const handleRowIndent = useCallback((rowId: string | number) => {
    const pageIndex = currentPageIndexRef.current;
    const currentContext = extractedPagesRef.current[pageIndex];
    if (!currentContext) return;

    const idx = currentContext.rows.findIndex((r) => r._id === rowId);
    if (idx === -1) return;

    const currentLevel = currentContext.rows[idx]._indentLevel ?? 0;
    const prevLevel = idx > 0 ? (currentContext.rows[idx - 1]._indentLevel ?? 0) : 0;
    const nextLevel = Math.min(currentLevel + 1, prevLevel + 1);

    setManualIndentLevels((prev) => ({
      ...prev,
      [pageIndex]: { ...(prev[pageIndex] ?? {}), [String(rowId)]: nextLevel },
    }));
  }, []);

  //Handle Row Outdent
  const handleRowOutdent = useCallback((rowId: string | number) => {
    const pageIndex = currentPageIndexRef.current;
    const currentContext = extractedPagesRef.current[pageIndex];
    if (!currentContext) return;

    const row = currentContext.rows.find((r) => r._id === rowId);
    if (!row) return;

    const currentLevel = row._indentLevel ?? 0;
    const nextLevel = Math.max(0, currentLevel - 1);

    setManualIndentLevels((prev) => ({
      ...prev,
      [pageIndex]: { ...(prev[pageIndex] ?? {}), [String(rowId)]: nextLevel },
    }));
  }, []);

  const handleCarouselAccept = (updates: { fieldId: string; newValue: string }[]) => {
    if (!documentContext) return;

    setExtractedPages((prev) => {
      const next = [...prev];
      updates.forEach(({ fieldId, newValue }) => {
        const [rowId, column] = fieldId.split(':');

        //find what page the issue belongs to
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

    saveExtractionSession(extractedPagesRef.current);
    const fieldIds = updates.map(({ fieldId }) => fieldId);
    setFlaggedIssues((prev) => prev.filter((issue) => !fieldIds.includes(issue.fieldId)));
  };

  const handleCarouselReject = (fieldIds: string[]) => {
    if (!documentContext) return;

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
  };

  const handleCarouselManualEdit = (fieldId: string, newValue: string) => {
    if (!documentContext) return;
    const [rowId, column] = fieldId.split(':');

    // find what page the issue is in
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

    setExtractedPages((prev) =>
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

    saveExtractionSession(extractedPagesRef.current);
    setFlaggedIssues((prev) => prev.filter((issue) => issue.fieldId !== fieldId));
  };

  const handleFetchSuggestion = useCallback(
    async (fieldId: string) => {
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
    [documentContext, flaggedIssues]
  );

  const handleFetchBulkSuggestion = useCallback(
    async (
      column: string,
      fields: { fieldId: string; rowId: string | number; ocrValue: string }[],
      formatRegex?: string
    ): Promise<Record<string, string> | null> => {
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
    [documentContext, flaggedIssues]
  );

  if (!documentContext) {
    return (
      <div className="flex h-screen items-center justify-center font-semibold text-lg">
        Loading...
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="flex flex-col lg:flex-row w-full p-3 gap-3 h-auto lg:h-[calc(100vh-72px)] lg:overflow-hidden"
      >
        <div
          className="w-full h-[50vh] lg:h-full"
          style={isLarge ? { width: `${splitPercent}%` } : { width: '100%' }}
        >
          <DocumentPanel
            hoveredOverlayIds={hoveredDocumentOverlayIds}
            documentImageUrl={documentImageURL}
            ocrData={ocrData}
            imageUrls={imageUrls}
            currentPageIndex={currentPageIndex}
            onPageChange={setCurrentPageIndex}
          />
        </div>

        <div
          onMouseDown={onMouseDown}
          onDoubleClick={() => setSplitPercent(50)}
          className="hidden lg:flex items-center justify-center w-2 mx-1 cursor-col-resize flex-shrink-0 group"
        >
          <div className="w-1 h-12 rounded-full bg-gray-300 group-hover:bg-blue-400 transition-colors duration-150" />
        </div>

        <div
          className="w-full h-[50vh] lg:h-full"
          style={
            isLarge
              ? {
                  width: `${100 - splitPercent}%`,
                }
              : { width: '100%' }
          }
        >
          <ExtractedDataPanel
            key={tableKey}
            isEditMode={isEditMode}
            onEditModeChange={setIsEditMode}
            editedCells={editedCells}
            onHover={(id) => {
              if (isChatOpen && chatActiveTab === 'review') return;

              setHoveredTableFieldIds(id ? [id] : []);

              if (id && documentContext) {
                const [rowId, column] = id.split(':');
                const row = documentContext.rows.find((r) => String(r._id) === rowId);
                const overlayId = row?._cellKeyMap?.[column] ?? null;
                setHoveredDocumentOverlayIds(overlayId ? [overlayId] : []);
              } else {
                setHoveredDocumentOverlayIds([]);
              }
            }}
            extractedData={documentContext}
            hoveredOverlayIds={hoveredTableFieldIds}
            onRowIndent={handleRowIndent}
            onRowOutdent={handleRowOutdent}
            onCellEdit={(fieldId, newValue) => {
              if (!documentContext) return;

              undoStack.current.push(extractedPagesRef.current);

              const [rowId, column] = fieldId.split(':');

              // get old value for histroy
              const currentPage = extractedPagesRef.current[currentPageIndex];
              const currentRow = currentPage?.rows.find((r) => String(r._id) === rowId);
              const oldValue = currentRow ? String(currentRow[column] ?? '') : '';

              addHistoryEntry({
                type: 'edit',
                pageIndex: currentPageIndex,
                fieldId,
                column,
                oldValue,
                newValue,
                description: `Edited "${column}" on page ${currentPageIndex + 1}: "${oldValue}" to "${newValue}"`,
              });

              redoStack.current = [];

              setExtractedPages((prev) =>
                prev.map((page, i) =>
                  i !== currentPageIndex
                    ? page
                    : {
                        ...page,
                        rows: page.rows.map((r) =>
                          String(r._id) === rowId ? { ...r, [column]: newValue } : r
                        ),
                      }
                )
              );

              setEditedCells((prev) => new Set(prev).add(fieldId));
              saveExtractionSession(extractedPagesRef.current);
              setFlaggedIssues((prev) => prev.filter((issue) => issue.fieldId !== fieldId));
            }}
            onRowAdd={() => {
              if (!documentContext) return;
              undoStack.current.push(extractedPagesRef.current);
              redoStack.current = [];

              const newRowId = `manual_row_${Date.now()}`;
              const newRow: any = { _id: newRowId, _confidence: 1, _cellConfidence: {} };
              documentContext.columns.forEach((col) => {
                newRow[col] = '';
              });

              setExtractedPages((prev) =>
                prev.map((page, i) =>
                  i !== currentPageIndex ? page : { ...page, rows: [...page.rows, newRow] }
                )
              );
              saveExtractionSession(extractedPagesRef.current);
            }}
            onRowDelete={(rowId) => {
              if (!documentContext) return;
              undoStack.current.push(extractedPagesRef.current);
              redoStack.current = [];

              setExtractedPages((prev) =>
                prev.map((page, i) =>
                  i !== currentPageIndex
                    ? page
                    : { ...page, rows: page.rows.filter((r) => r._id !== rowId) }
                )
              );
              saveExtractionSession(extractedPagesRef.current);
            }}
            onColumnAdd={(columnName) => {
              if (!documentContext) return;
              undoStack.current.push(extractedPagesRef.current);
              redoStack.current = [];
              if (documentContext.columns.includes(columnName)) return;

              setExtractedPages((prev) =>
                prev.map((page, i) =>
                  i !== currentPageIndex
                    ? page
                    : {
                        ...page,
                        columns: [...page.columns, columnName],
                        rows: page.rows.map((r) => ({ ...r, [columnName]: '' })),
                      }
                )
              );
              saveExtractionSession(extractedPagesRef.current);
            }}
            onColumnDelete={(columnName) => {
              if (!documentContext) return;
              undoStack.current.push(extractedPagesRef.current);
              redoStack.current = [];

              setExtractedPages((prev) =>
                prev.map((page, i) => {
                  if (i !== currentPageIndex) return page;
                  return {
                    ...page,
                    columns: page.columns.filter((c) => c !== columnName),
                    rows: page.rows.map((r) => {
                      const newRow = { ...r };
                      delete newRow[columnName];
                      return newRow;
                    }),
                  };
                })
              );
              saveExtractionSession(extractedPagesRef.current);
            }}
            onRowMove={(rowId, direction) => {
              if (!documentContext) return;
              undoStack.current.push(extractedPagesRef.current);
              redoStack.current = [];

              setExtractedPages((prev) =>
                prev.map((page, i) => {
                  if (i !== currentPageIndex) return page;
                  const rows = [...page.rows];
                  const idx = rows.findIndex((r) => r._id === rowId);
                  if (idx === -1) return page;

                  if (direction === 'up' && idx > 0) {
                    [rows[idx - 1], rows[idx]] = [rows[idx], rows[idx - 1]];
                  } else if (direction === 'down' && idx < rows.length - 1) {
                    [rows[idx], rows[idx + 1]] = [rows[idx + 1], rows[idx]];
                  } else {
                    return page;
                  }

                  return { ...page, rows };
                })
              );
              saveExtractionSession(extractedPagesRef.current);
            }}
            onColumnReorder={(newColumns) => {
              if (!documentContext) return;
              undoStack.current.push(extractedPagesRef.current);
              redoStack.current = [];

              setExtractedPages((prev) =>
                prev.map((page, i) =>
                  i !== currentPageIndex ? page : { ...page, columns: newColumns }
                )
              );
              saveExtractionSession(extractedPagesRef.current);
            }}
          />
        </div>
      </div>

      {/* Floating Chat Modal / Review Panel */}
      <ChatPanel
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
        messages={messages}
        onAddMessage={addMessage}
        documentContext={documentContext}
        onContextUpdate={handleContextUpdate}
        onAccept={handleAccept}
        onReject={handleReject}
        flaggedIssues={flaggedIssues}
        onCarouselAccept={handleCarouselAccept}
        onCarouselReject={handleCarouselReject}
        onCarouselManualEdit={handleCarouselManualEdit}
        onSlideChange={handleSlideChange}
        onFetchSuggestion={handleFetchSuggestion}
        onFetchBulkSuggestion={handleFetchBulkSuggestion}
        activeTab={chatActiveTab}
        onTabChange={setChatActiveTab}
        resolvedIssueIds={resolvedIssueIds}
        onResolveIssues={handleResolveIssues}
        history={history}
      />
    </>
  );
}

export default ValidationPage;
