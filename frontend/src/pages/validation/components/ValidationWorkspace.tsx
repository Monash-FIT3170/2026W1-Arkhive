import { useState, useEffect, useRef, useCallback } from 'react';
import DocumentPanel from './document/DocumentPanel';
import ExtractedDataPanel from './extracted-data/ExtractedDataPanel';
import ChatPanel from './chat/ChatPanel';
import type { OCRComponent } from '../../../models/OCRComponent';
import type { ExtractedPage } from '../../../models/TableData';
import type { HistoryEntry } from '../../../models/HistoryEntry';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { useFieldHover } from '../../../hooks/useFieldHover';
import { useChatSuggestionFlow } from '../../../hooks/useChat';
import { useRowIndent } from '../../../hooks/useRowIndent';
import { useTableEditor } from '../../../hooks/useTableEditor';
import { useReviewQueue } from '../../../hooks/useReviewQueue';

function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsLarge(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isLarge;
}

export interface ValidationWorkspaceProps {
  /** The pages to validate, adopted into internal state whenever `syncKey` changes. */
  pages: ExtractedPage[];
  /** Raw OCR components per page, aligned index-for-index with `pages`. */
  ocrPages: OCRComponent[][];
  /** Image URL per page, aligned index-for-index with `pages`. */
  imageUrls: string[];
  /**
   * Called with the full, current pages array whenever it changes and should
   * be saved. The caller decides how/where that gets persisted (a single
   * session save, one save-per-page, etc) — the workspace and its hooks don't
   * know or care about that.
   */
  onPersist: (pages: ExtractedPage[]) => void;
  /** Optional height override for the split container (defaults to filling the viewport below a 72px header). */
  heightClassName?: string;
}

// Everything below "how do we get pages in and where do they get saved" is
// shared between the single-session Upload/Validation flow and the
// project-workspace flow: the six editing/review hooks, the resizable
// document/table split, and the floating chat + review + history panel.
function ValidationWorkspace({
  pages,
  ocrPages,
  imageUrls,
  onPersist,
  heightClassName = 'lg:h-[calc(100vh-72px)]',
}: ValidationWorkspaceProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>(pages);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const documentContext: ExtractedPage | null = extractedPages[currentPageIndex] ?? null;
  const ocrData: OCRComponent[] = ocrPages[currentPageIndex] ?? [];
  const documentImageURL: string | undefined = imageUrls[currentPageIndex];

  const isLarge = useIsLargeScreen();
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tableKey, setTableKey] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());
  const [chatActiveTab, setChatActiveTab] = useState<'chat' | 'review' | 'history'>('chat');

  const extractedPagesRef = useRef<ExtractedPage[]>(pages);
  const currentPageIndexRef = useRef(0);

  const handlePagesChange = useCallback((action: React.SetStateAction<ExtractedPage[]>) => {
    setExtractedPages((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      extractedPagesRef.current = next; // <-- Instantly update the Ref!
      return next;
    });
  }, []);

  const handlePageIndexChange = useCallback((action: React.SetStateAction<number>) => {
    setCurrentPageIndex((prev) => {
      const next = typeof action === 'function' ? action(prev) : action;
      currentPageIndexRef.current = next;
      return next;
    });
  }, []);

  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const addHistoryEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setHistory((prev) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  }, []);

  // UNDO/REDO PIPELINE — stack + keyboard shortcuts live in the hook; we
  // just say what "apply a snapshot" means for this workspace's state.
  const { push: pushUndo, undo: handleUndo } = useUndoRedo(extractedPagesRef, {
    onApply: (updatedPages, direction) => {
      setExtractedPages(updatedPages);
      onPersist(updatedPages);
      setEditedCells(new Set());
      setTableKey((k) => k + 1);
      addHistoryEntry({
        type: direction,
        description: direction === 'undo' ? 'Undid last change' : 'Redid last change',
      });
    },
  });

  // REVIEW QUEUE — confidence/format detection, carousel accept/reject/edit,
  // and AI suggestion fetches. See src/hooks/useReviewQueue.ts.
  const {
    flaggedIssues,
    setFlaggedIssues,
    resolvedIssueIds,
    handleResolveIssues,
    handleCarouselAccept,
    handleCarouselReject,
    handleCarouselManualEdit,
    handleFetchSuggestion,
    handleFetchBulkSuggestion,
  } = useReviewQueue({
    extractedPages,
    currentPageIndex,
    extractedPagesRef,
    onPagesChange: handlePagesChange,
    onPersist,
    addHistoryEntry,
    pushUndo,
    onIssuesDetected: () => setChatActiveTab('review'),
  });

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

  // bounding box hover state — table field <-> document overlay sync,
  // plus carousel-driven page navigation via handleSlideChange
  const { hoveredTableFieldIds, hoveredDocumentOverlayIds, handleHover, handleSlideChange } =
    useFieldHover(documentContext, {
      currentPageIndexRef,
      pagesRef: extractedPagesRef,
      onPageChange: handlePageIndexChange,
    });

  // AI-suggestion propose/accept/reject flow (chat messages live here too,
  // since they only ever get created in response to accept/reject).
  const { messages, addMessage, handleContextUpdate, handleAccept, handleReject } =
    useChatSuggestionFlow({
      currentPageIndex,
      documentContext,
      extractedPagesRef,
      onPagesChange: handlePagesChange,
      onPersist,
      pushUndo,
    });

  // Row indent/outdent
  const { handleRowIndent, handleRowOutdent } = useRowIndent({
    currentPageIndexRef,
    extractedPagesRef,
    onPagesChange: handlePagesChange,
    onPersist,
    addHistoryEntry,
    pushUndo,
  });

  // Cell/row/column CRUD for the table itself
  const { editCell, addRow, deleteRow, addColumn, deleteColumn, moveRow, reorderColumns } =
    useTableEditor({
      currentPageIndexRef,
      extractedPagesRef,
      onPagesChange: handlePagesChange,
      onPersist,
      addHistoryEntry,
      pushUndo,
      onCellEdited: (fieldId) => {
        setEditedCells((prev) => new Set(prev).add(fieldId));
        setFlaggedIssues((prev) => prev.filter((issue) => issue.fieldId !== fieldId));
      },
    });

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
        className={`flex flex-col lg:flex-row w-full p-3 gap-3 h-auto ${heightClassName} lg:overflow-hidden`}
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
            onPageChange={handlePageIndexChange}
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
            onUndoLast={handleUndo}
            key={tableKey}
            isEditMode={isEditMode}
            onEditModeChange={setIsEditMode}
            editedCells={editedCells}
            onHover={(id) => {
              if (isChatOpen && chatActiveTab === 'review') return;
              handleHover(id);
            }}
            extractedData={documentContext}
            hoveredOverlayIds={hoveredTableFieldIds}
            onRowIndent={handleRowIndent}
            onRowOutdent={handleRowOutdent}
            onCellEdit={editCell}
            onRowAdd={addRow}
            onRowDelete={deleteRow}
            onColumnAdd={addColumn}
            onColumnDelete={deleteColumn}
            onRowMove={moveRow}
            onColumnReorder={reorderColumns}
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

export default ValidationWorkspace;
