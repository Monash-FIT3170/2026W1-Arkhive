import { useState, useEffect, useRef, useCallback } from 'react';
import DocumentPanel from './components/document/DocumentPanel';
import ExtractedDataPanel from './components/extracted-data/ExtractedDataPanel';
import ChatPanel from './components/chat/ChatPanel';
import BatchDocumentSelector from './components/batch/BatchDocumentSelector';
import type { ChatMessage } from '../../models/Message';
import type { OCRComponent } from '../../models/OCRComponent';
import type { ExtractedData } from '../../models/TableData';
import type { DocumentJob } from '../../models/Job';
import {
  getExtractionSession,
  saveExtractionSession,
  getBatchJobs,
  setActiveBatchJob
} from '../../services/extractionService';
import { getUploadedImageUrl } from '../../services/uploadService';
import { detectReviewFields } from './components/extracted-data/detectReviewFields';
import { requestFieldReview } from '../../services/llmService';
import type { OcrIssue } from './components/chat/OcrReviewWidget';
import { flatten } from './components/extracted-data/flattener';

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
  const [jobs, setJobs] = useState<DocumentJob[]>([]);
  const [activeJobIndex, setActiveJobIndex] = useState<number>(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documentContext, setDocumentContext] = useState<ExtractedData | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [oldContext, setOldContext] = useState<ExtractedData | null>(null); // for AI suggestion
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
  const [hasDetected, setHasDetected] = useState(false);
  const [chatActiveTab, setChatActiveTab] = useState<'chat' | 'review'>('chat');

  // Load session & batch jobs on mount
  useEffect(() => {
    async function loadSession() {
      try {
        const batchData = await getBatchJobs().catch(() => null);

        if (batchData && batchData.jobs && batchData.jobs.length > 0) {
          setJobs(batchData.jobs);
          const initialIndex = batchData.activeJobIndex ?? 0;
          setActiveJobIndex(initialIndex);

          const activeJob = batchData.jobs[initialIndex] || batchData.jobs[0];
          setOCRData(activeJob.ocrData || []);
          setDocumentImageURL(getUploadedImageUrl(activeJob.imageIndex ?? initialIndex));

          const initialTable = activeJob.extractedData || flatten(activeJob.ocrData as OCRComponent[]);
          setDocumentContext(initialTable);
          return;
        }

        // Fallback for single document extraction
        const singleOcrData = await getExtractionSession();
        setOCRData(singleOcrData || []);
        setDocumentImageURL(getUploadedImageUrl());
        setDocumentContext(flatten((singleOcrData || []) as OCRComponent[]));
      } catch (error) {
        console.error('Failed to load extraction session', error);
      }
    }
    loadSession();
  }, []);

  // Update flagged issues when documentContext changes
  useEffect(() => {
    if (documentContext && !hasDetected) {
      const fields = detectReviewFields(documentContext);
      const issues = fields.map((f) => ({
        fieldId: `${f.rowId}:${f.column}`,
        fieldName: f.column,
        ocrValue: String(f.value),
        confidenceScore: f.confidence,
      }));
      setFlaggedIssues(issues);
      setHasDetected(true);
      if (issues.length > 0) {
        setChatActiveTab('review');
      }
    }
  }, [documentContext, hasDetected]);

  useEffect(() => {
    documentContextRef.current = documentContext;
  }, [documentContext]);

  // Handle switching between batch documents
  const handleSelectJob = useCallback(
    async (newIndex: number) => {
      if (newIndex === activeJobIndex || newIndex < 0 || newIndex >= jobs.length) return;

      // 1. Save current document context to jobs state & server
      if (documentContext && jobs[activeJobIndex]) {
        const currentJobId = jobs[activeJobIndex].id;
        try {
          await saveExtractionSession(documentContext, currentJobId);
        } catch (e) {
          console.error('Failed to auto-save previous document extraction', e);
        }
      }

      // 2. Switch to target job
      const targetJob = jobs[newIndex];
      setActiveJobIndex(newIndex);
      setActiveBatchJob(newIndex).catch(() => {});

      const newOcrData = targetJob.ocrData || [];
      const newExtractedData = targetJob.extractedData || flatten(newOcrData);

      setOCRData(newOcrData);
      setDocumentImageURL(getUploadedImageUrl(targetJob.imageIndex ?? newIndex));
      setDocumentContext(newExtractedData);

      // Reset state for new document
      undoStack.current = [];
      redoStack.current = [];
      setEditedCells(new Set());
      setOldContext(null);
      setHasDetected(false);
      setFlaggedIssues([]);
      setTableKey((k) => k + 1);
    },
    [activeJobIndex, jobs, documentContext]
  );

  // Keyboard undo / redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isUndo = e.metaKey && e.key === 'z' && !e.shiftKey;
      const isRedo = e.metaKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey));

      if (isUndo) {
        e.preventDefault();
        if (undoStack.current.length === 0) return;

        const previous = undoStack.current.pop()!;
        redoStack.current.push(documentContextRef.current!);

        setDocumentContext(previous);
        saveExtractionSession(previous, jobs[activeJobIndex]?.id || activeJobIndex);
        setEditedCells(new Set());
        setTableKey((k) => k + 1);
      }

      if (isRedo) {
        e.preventDefault();
        if (redoStack.current.length === 0) return;

        const next = redoStack.current.pop()!;
        undoStack.current.push(documentContextRef.current!);

        setDocumentContext(next);
        saveExtractionSession(next, jobs[activeJobIndex]?.id || activeJobIndex);
        setEditedCells(new Set());
        setTableKey((k) => k + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jobs, activeJobIndex]);

  // Resizing Functions
  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percent = (offsetX / rect.width) * 100;
    setSplitPercent(Math.min(80, Math.max(20, percent)));
  }, []);

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

  // Bounding box hover state
  const [hoveredTableFieldId, setHoveredTableFieldId] = useState<string | null>(null);
  const [hoveredDocumentOverlayId, setHoveredDocumentOverlayId] = useState<string | null>(null);

  const handleSlideChange = useCallback(
    (fieldId: string | null) => {
      setHoveredTableFieldId(fieldId);
      if (!fieldId) {
        setHoveredDocumentOverlayId(null);
        return;
      }
      const [rowId, column] = fieldId.split(':');
      if (documentContext) {
        const row = documentContext.rows.find((r) => String(r._id) === rowId);
        if (row && row._cellKeyMap && row._cellKeyMap[column]) {
          setHoveredDocumentOverlayId(row._cellKeyMap[column]);
          return;
        }
      }
      setHoveredDocumentOverlayId(null);
    },
    [documentContext]
  );

  const addMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  const handleContextUpdate = (updatedData: ExtractedData) => {
    setOldContext(documentContext);
    setDocumentContext(updatedData);
  };

  const resolveLastMessage = () => {
    setMessages((prev) =>
      prev.map((msg, i) => (i === prev.length - 1 ? { ...msg, resolved: true } : msg))
    );
  };

  const persistDocumentChanges = (newContext: ExtractedData) => {
    setDocumentContext(newContext);
    const currentJobId = jobs[activeJobIndex]?.id;
    saveExtractionSession(newContext, currentJobId || activeJobIndex);

    // Update local jobs array with extracted table data
    if (jobs.length > 0) {
      setJobs((prev) => {
        const next = [...prev];
        if (next[activeJobIndex]) {
          next[activeJobIndex] = {
            ...next[activeJobIndex],
            extractedData: newContext,
            updatedAt: Date.now()
          };
        }
        return next;
      });
    }
  };

  // Chat accept / reject
  const handleAccept = async () => {
    if (!documentContext) return;
    try {
      persistDocumentChanges(documentContext);
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

  const handleReject = () => {
    if (!oldContext) return;
    setDocumentContext(oldContext);
    setOldContext(null);
    resolveLastMessage();
    addMessage({
      id: crypto.randomUUID(),
      role: 'model',
      content: 'No problem, the changes have been reverted.',
      timestamp: new Date().toISOString(),
    });
  };

  const handleCarouselAccept = (fieldId: string, newValue: string) => {
    if (!documentContext) return;
    const [rowId, column] = fieldId.split(':');
    const newContext = {
      ...documentContext,
      rows: documentContext.rows.map((r) => (r._id === rowId ? { ...r, [column]: newValue } : r)),
    };
    persistDocumentChanges(newContext);
    setFlaggedIssues((prev) => prev.filter((issue) => issue.fieldId !== fieldId));
  };

  const handleCarouselReject = (fieldId: string) => {
    if (!documentContext) return;
    const [rowId, column] = fieldId.split(':');
    const newContext = {
      ...documentContext,
      rows: documentContext.rows.map((r) => (r._id === rowId ? { ...r, [column]: '' } : r)),
    };
    persistDocumentChanges(newContext);
    setFlaggedIssues((prev) => prev.filter((issue) => issue.fieldId !== fieldId));
  };

  const handleCarouselManualEdit = (fieldId: string, newValue: string) => {
    if (!documentContext) return;
    const [rowId, column] = fieldId.split(':');
    const newContext = {
      ...documentContext,
      rows: documentContext.rows.map((r) => (r._id === rowId ? { ...r, [column]: newValue } : r)),
    };
    persistDocumentChanges(newContext);
    setFlaggedIssues((prev) => prev.filter((issue) => issue.fieldId !== fieldId));
  };

  const handleFetchSuggestion = useCallback(
    async (fieldId: string) => {
      if (!documentContext) return null;
      const [rowId, column] = fieldId.split(':');
      const issue = flaggedIssues.find((i) => i.fieldId === fieldId);
      if (!issue) return null;

      const field = { rowId, column, value: issue.ocrValue, confidence: issue.confidenceScore };

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

  if (!documentContext) {
    return (
      <div className="flex h-screen items-center justify-center font-semibold text-lg">
        <span className="loading loading-spinner loading-md mr-2" />
        Loading document extraction...
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Batch Document Selector Bar */}
      {jobs.length > 0 && (
        <BatchDocumentSelector
          jobs={jobs}
          activeJobIndex={activeJobIndex}
          onSelectJob={handleSelectJob}
        />
      )}

      {/* Main Split Panels */}
      <div
        ref={containerRef}
        className="flex flex-col lg:flex-row w-full p-3 gap-3 flex-1 min-h-0 lg:overflow-hidden"
      >
        <div
          className="w-full h-[50vh] lg:h-full"
          style={isLarge ? { width: `${splitPercent}%` } : { width: '100%' }}
        >
          <DocumentPanel
            hoveredOverlayId={hoveredDocumentOverlayId}
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
              setHoveredTableFieldId(id);
              if (id && documentContext) {
                const [rowId, column] = id.split(':');
                const row = documentContext.rows.find((r) => String(r._id) === rowId);
                setHoveredDocumentOverlayId(row?._cellKeyMap?.[column] ?? null);
              } else {
                setHoveredDocumentOverlayId(null);
              }
            }}
            extractedData={documentContext}
            hoveredOverlayId={hoveredTableFieldId}
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
              persistDocumentChanges(newContext);
              setFlaggedIssues((prev) => prev.filter((issue) => issue.fieldId !== fieldId));
            }}
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
              persistDocumentChanges(newContext);
            }}
            onRowDelete={(rowId) => {
              if (!documentContext) return;
              undoStack.current.push(documentContext);
              redoStack.current = [];
              const newContext = {
                ...documentContext,
                rows: documentContext.rows.filter((r) => r._id !== rowId),
              };
              persistDocumentChanges(newContext);
            }}
            onColumnAdd={(columnName) => {
              if (!documentContext) return;
              undoStack.current.push(documentContext);
              redoStack.current = [];
              if (documentContext.columns.includes(columnName)) return;

              const newContext = {
                ...documentContext,
                columns: [...documentContext.columns, columnName],
                rows: documentContext.rows.map((r) => ({ ...r, [columnName]: '' })),
              };
              persistDocumentChanges(newContext);
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
              persistDocumentChanges(newContext);
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
                return;
              }

              const newContext = { ...documentContext, rows };
              persistDocumentChanges(newContext);
            }}
            onColumnReorder={(newColumns) => {
              if (!documentContext) return;
              undoStack.current.push(documentContext);
              redoStack.current = [];
              const newContext = {
                ...documentContext,
                columns: newColumns,
              };
              persistDocumentChanges(newContext);
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
        activeTab={chatActiveTab}
        onTabChange={setChatActiveTab}
      />
    </div>
  );
}

export default ValidationPage;
