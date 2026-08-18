import { useState, useEffect, useRef, useCallback } from 'react';
import DocumentPanel from './components/document/DocumentPanel';
import ExtractedDataPanel from './components/extracted-data/ExtractedDataPanel';
import ChatPanel from './components/chat/ChatPanel';
import type { ChatMessage, ReviewField } from '../../models/Message';
import type { OCRComponent } from '../../models/OCRComponent';
import type { ExtractedData } from '../../models/TableData';
import { getExtractionSession, saveExtractionSession } from '../../services/extractionService';
import { getUploadedImageUrl } from '../../services/uploadService';
import { detectReviewFields } from './components/extracted-data/detectReviewFields';
import {
  requestBulkFieldReview,
  requestFieldReview,
  requestFormatDetection,
} from '../../services/llmService';
import type { OcrIssue } from './components/chat/OcrReviewWidget';
import { flatten } from './components/extracted-data/flattener';
import { checkTableFormats } from './components/extracted-data/detectFormat';
import { getTestData, getTestImageUrls } from '../../services/testService';

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
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documentContext, setDocumentContext] = useState<ExtractedData | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [oldContext, setOldContext] = useState<ExtractedData | null>(null); //for AI suggesiton
  const [documentImageURL, setDocumentImageURL] = useState<string>();
  const [ocrData, setOCRData] = useState<OCRComponent[]>([]);
  const isLarge = useIsLargeScreen();
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const undoStack = useRef<ExtractedData[]>([]);
  const redoStack = useRef<ExtractedData[]>([]);
  const documentContextRef = useRef<ExtractedData | null>(null);
  const [tableKey, setTableKey] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());

  const [flaggedIssues, setFlaggedIssues] = useState<OcrIssue[]>([]);
  const [chatActiveTab, setChatActiveTab] = useState<'chat' | 'review'>('chat');

  useEffect(() => {
    async function loadSession() {
      try {
        // let ocrData = await getExtractionSession();
        let ocrData = await getTestData();
        let urls = await getTestImageUrls();
        console.log('hello');
        console.log(ocrData[0]);
        setOCRData(ocrData[0]);
        // setDocumentImageURL(await getUploadedImageUrl());
        setDocumentImageURL(urls[0]);
        setDocumentContext(flatten(ocrData[0] as OCRComponent[]));
      } catch (error) {
        console.error('Failed to load extraction session', error);
      }
    }
    loadSession();
  }, []);
  const hasStartedRef = useRef(false);
  useEffect(() => {
    async function performFormatDetection() {
      if (!documentContext || hasStartedRef.current) return;
      hasStartedRef.current = true;
      // Low Confidence Detection
      const fields = detectReviewFields(documentContext);
      const confidenceIssues: OcrIssue[] = fields.map((f) => ({
        fieldId: `${f.rowId}:${f.column}`,
        fieldName: f.column,
        ocrValue: String(f.value),
        confidenceScore: f.confidence,
        issueType: 'confidence',
        rowId: f.rowId,
      }));

      // Randomly sample 10–30 non-empty values per column for format detection.
      // Sample size is based on table size:
      //   - Minimum: 10 values
      //   - 10% of rows for medium-sized tables
      //   - Maximum: 30 values
      const sampledData: Record<string, string[]> = {};

      const sampleSize = Math.min(30, Math.max(10, Math.ceil(documentContext.rows.length * 0.1)));

      for (const col of documentContext.columns) {
        const values: string[] = [];

        // Collect all non-empty values for this column
        for (const row of documentContext.rows) {
          const val = row[col];

          if (val !== null && val !== undefined && String(val).trim() !== '') {
            values.push(String(val).trim());
          }
        }

        // Randomly sample up to the calculated sample size
        const shuffled = values.sort(() => Math.random() - 0.5);
        const samples = shuffled.slice(0, sampleSize);

        if (samples.length > 0) {
          sampledData[col] = samples;
        }
      }

      let formatIssues: OcrIssue[] = [];
      let columnRegexMap: Record<string, string> = {};
      try {
        columnRegexMap = await requestFormatDetection(sampledData);
        formatIssues = checkTableFormats(documentContext, columnRegexMap).map((f) => ({
          fieldId: `${f.rowId}:${f.column}`,
          fieldName: f.column,
          ocrValue: String(f.value),
          confidenceScore: 0.3, // fallback confidence score for format issues
          issueType: 'format' as const,
          rowId: f.rowId,
        }));
      } catch (error) {
        console.error('Failed to detect format issues', error);
      }

      // Group format issues by column. Columns with >1 flagged cell become a single bulk-resolvable group.
      // a lone flagged cell stays single-field.
      const byColumn = formatIssues.reduce<Record<string, OcrIssue[]>>((acc, issue) => {
        (acc[issue.fieldName] ??= []).push(issue);
        return acc;
      }, {});

      Object.entries(byColumn).forEach(([column, colIssues]) => {
        // If column has more then 1 issue - make a group and assign to each issue of that group
        if (colIssues.length > 1) {
          const groupId = `format:${column}`;
          colIssues.forEach((issue) => {
            issue.groupId = groupId;
            issue.formatRegex = columnRegexMap[column];
          });
        }
      });

      // Merge Issues
      const issues = confidenceIssues.concat(formatIssues);

      setFlaggedIssues(issues);
      if (issues.length > 0) {
        setChatActiveTab('review');
      }
    }

    performFormatDetection();
  }, [documentContext]);

  useEffect(() => {
    documentContextRef.current = documentContext;
  }, [documentContext]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUndo = e.metaKey && e.key === 'z' && !e.shiftKey;
      const isRedo = e.metaKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey));

      if (isUndo) {
        e.preventDefault();

        if (undoStack.current.length === 0) {
          return;
        }

        // pop last state from undo stack
        const previous = undoStack.current.pop()!;

        // push current into redo stack
        redoStack.current.push(documentContextRef.current!);

        //restore previous state
        setDocumentContext(previous);
        saveExtractionSession(previous);
        setEditedCells(new Set());
        setTableKey((k) => k + 1);
      }

      if (isRedo) {
        e.preventDefault();

        if (redoStack.current.length === 0) {
          return;
        }

        // pop last state from redo stack
        const next = redoStack.current.pop()!;

        // push current into undo stack
        undoStack.current.push(documentContextRef.current!);

        setDocumentContext(next);
        saveExtractionSession(next);
        setEditedCells(new Set());
        setTableKey((k) => k + 1);
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

  const handleSlideChange = useCallback(
    (fieldIds: string[]) => {
      setHoveredTableFieldIds(fieldIds);

      if (fieldIds.length === 0 || !documentContext) {
        setHoveredDocumentOverlayIds([]);
        return;
      }

      const overlayIds = fieldIds
        .map((fieldId) => {
          const [rowId, column] = fieldId.split(':');
          const row = documentContext.rows.find((r) => String(r._id) === rowId);
          return row?._cellKeyMap?.[column];
        })
        .filter((id): id is string => Boolean(id));

      setHoveredDocumentOverlayIds(overlayIds);
    },
    [documentContext]
  );

  const addMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  // called when AI returns updatedContext after accepting suggestion
  const handleContextUpdate = (updatedData: ExtractedData) => {
    setOldContext(documentContext); // save snapshot before overwriting
    setDocumentContext(updatedData);
  };

  const resolveLastMessage = () => {
    setMessages((prev) =>
      prev.map((msg, i) => (i === prev.length - 1 ? { ...msg, resolved: true } : msg))
    );
  };

  //handle accept
  const handleAccept = async () => {
    if (!documentContext) {
      return;
    }
    try {
      await saveExtractionSession(documentContext); // accept content
    } catch (error) {
      console.error('Failed to save session after accept', error);
    }
    setOldContext(null); // old to null
    resolveLastMessage(); // hide buttons
    //ai confirmation message
    addMessage({
      id: crypto.randomUUID(),
      role: 'model',
      content: 'Got it! The changes have been applied and saved.',
      timestamp: new Date().toISOString(),
    });
  };

  //handle reject
  const handleReject = () => {
    if (!oldContext) {
      return;
    }
    setDocumentContext(oldContext); // back to old
    setOldContext(null); // old to null
    resolveLastMessage(); // hide buttons
    addMessage({
      id: crypto.randomUUID(),
      role: 'model',
      content: 'No problem, the changes have been reverted.',
      timestamp: new Date().toISOString(),
    });
  };

  const handleCarouselAccept = (updates: { fieldId: string; newValue: string }[]) => {
    if (!documentContext) return;

    const newContext = {
      ...documentContext,
      rows: documentContext.rows.map((row) => {
        const rowUpdates = updates.filter(({ fieldId }) => {
          const [rowId] = fieldId.split(':');
          return String(row._id) === String(rowId);
        });

        if (rowUpdates.length === 0) return row;

        return rowUpdates.reduce((updatedRow, { fieldId, newValue }) => {
          const [, column] = fieldId.split(':');

          return {
            ...updatedRow,
            [column]: newValue,
          };
        }, row);
      }),
    };

    setDocumentContext(newContext);
    saveExtractionSession(newContext);

    const fieldIds = updates.map(({ fieldId }) => fieldId);

    setFlaggedIssues((prev) => prev.filter((issue) => !fieldIds.includes(issue.fieldId)));
  };

  const handleCarouselReject = (fieldIds: string[]) => {
    if (!documentContext) return;

    const newContext = {
      ...documentContext,
      rows: documentContext.rows.map((row) => {
        const updatesForRow = fieldIds.filter((fieldId) => {
          const [rowId] = fieldId.split(':');
          return String(row._id) === String(rowId);
        });

        if (updatesForRow.length === 0) return row;

        return updatesForRow.reduce((updatedRow, fieldId) => {
          const [, column] = fieldId.split(':');

          return {
            ...updatedRow,
            [column]: '',
          };
        }, row);
      }),
    };

    setDocumentContext(newContext);
    saveExtractionSession(newContext);

    setFlaggedIssues((prev) => prev.filter((issue) => !fieldIds.includes(issue.fieldId)));
  };

  const handleCarouselManualEdit = (fieldId: string, newValue: string) => {
    if (!documentContext) return;
    const [rowId, column] = fieldId.split(':');
    const newContext = {
      ...documentContext,
      rows: documentContext.rows.map((r) => (r._id === rowId ? { ...r, [column]: newValue } : r)),
    };
    setDocumentContext(newContext);
    saveExtractionSession(newContext);
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
        return reply.response; // fallback to text response
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

        // Primary path: bulk_update intent with one entry per row.
        if (reply.intent?.type === 'bulk_update' && reply.intent.bulkUpdates) {
          reply.intent.bulkUpdates.forEach((u) => {
            map[String(u.rowId)] = u.newValue;
          });
        }

        // Fallback: pull corrected values out of updatedContext for any rows
        // the intent path missed (mirrors the single-field fallback).
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
                console.log(row?._cellKeyMap?.[column] ?? null);
                const overlayId = row?._cellKeyMap?.[column] ?? null;
                setHoveredDocumentOverlayIds(overlayId ? [overlayId] : []);
              } else {
                setHoveredDocumentOverlayIds([]);
              }
            }}
            extractedData={documentContext}
            hoveredOverlayIds={hoveredTableFieldIds}
            onCellEdit={(fieldId, newValue) => {
              if (!documentContext) return;

              undoStack.current.push(documentContext);
              redoStack.current = [];

              const [rowId, column] = fieldId.split(':');
              const newContext = {
                ...documentContext,
                rows: documentContext.rows.map((r) =>
                  String(r._id) === rowId ? { ...r, [column]: newValue } : r
                ),
              };

              setEditedCells((prev) => new Set(prev).add(fieldId));
              setDocumentContext(newContext);
              saveExtractionSession(newContext);
              setFlaggedIssues((prev) => prev.filter((issue) => issue.fieldId !== fieldId));
            }}
            //Acknowledgement: AI (Google Gemini) was used while coding the
            // manual corrections
            onRowAdd={() => {
              if (!documentContext) return;
              undoStack.current.push(documentContext);
              redoStack.current = [];
              const newRowId = `manual_row_${Date.now()}`;
              const newRow: any = { _id: newRowId, _confidence: 1, _cellConfidence: {} };
              documentContext.columns.forEach((col) => {
                newRow[col] = '';
              });
              const newContext = {
                ...documentContext,
                rows: [...documentContext.rows, newRow],
              };
              setDocumentContext(newContext);
              saveExtractionSession(newContext);
            }}
            onRowDelete={(rowId) => {
              if (!documentContext) return;
              undoStack.current.push(documentContext);
              redoStack.current = [];
              const newContext = {
                ...documentContext,
                rows: documentContext.rows.filter((r) => r._id !== rowId),
              };
              setDocumentContext(newContext);
              saveExtractionSession(newContext);
            }}
            onColumnAdd={(columnName) => {
              if (!documentContext) return;
              undoStack.current.push(documentContext);
              redoStack.current = [];
              // Avoid duplicates
              if (documentContext.columns.includes(columnName)) return;

              const newContext = {
                ...documentContext,
                columns: [...documentContext.columns, columnName],
                rows: documentContext.rows.map((r) => ({ ...r, [columnName]: '' })),
              };
              setDocumentContext(newContext);
              saveExtractionSession(newContext);
            }}
            onColumnDelete={(columnName) => {
              if (!documentContext) return;
              undoStack.current.push(documentContext);
              redoStack.current = [];
              const newContext = {
                ...documentContext,
                columns: documentContext.columns.filter((c) => c !== columnName),
                rows: documentContext.rows.map((r) => {
                  const newRow = { ...r };
                  delete newRow[columnName];
                  return newRow;
                }),
              };
              setDocumentContext(newContext);
              saveExtractionSession(newContext);
            }}
            onRowMove={(rowId, direction) => {
              if (!documentContext) return;
              undoStack.current.push(documentContext);
              redoStack.current = [];
              const rows = [...documentContext.rows];
              const idx = rows.findIndex((r) => r._id === rowId);
              if (idx === -1) return;

              if (direction === 'up' && idx > 0) {
                const temp = rows[idx];
                rows[idx] = rows[idx - 1];
                rows[idx - 1] = temp;
              } else if (direction === 'down' && idx < rows.length - 1) {
                const temp = rows[idx];
                rows[idx] = rows[idx + 1];
                rows[idx + 1] = temp;
              } else {
                return; // No move needed
              }

              const newContext = { ...documentContext, rows };
              setDocumentContext(newContext);
              saveExtractionSession(newContext);
            }}
            onColumnReorder={(newColumns) => {
              if (!documentContext) {
                return;
              }
              undoStack.current.push(documentContext);
              redoStack.current = [];
              const newContext = {
                ...documentContext,
                columns: newColumns,
              };
              setDocumentContext(newContext);
              saveExtractionSession(newContext);
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
      />
    </>
  );
}

export default ValidationPage;
