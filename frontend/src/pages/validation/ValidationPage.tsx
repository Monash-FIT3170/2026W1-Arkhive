import { useState, useEffect, useRef, useCallback } from 'react';
import DocumentPanel from './components/document/DocumentPanel';
import ExtractedDataPanel from './components/extracted-data/ExtractedDataPanel';
import ChatPanel from './components/chat/ChatPanel';
import type { ChatMessage, ReviewField } from '../../models/Message';
import type { OCRComponent, Pages } from '../../models/OCRComponent';
import type { ExtractedPage } from '../../models/TableData';
import { getProcessedImageUrls, getUploadedImageUrl } from '../../services/uploadService';
//import type { DocumentJob } from '../../models/Job';
import { getExtractionSession, saveExtractionSession } from '../../services/extractionService';
import { reindentRow, type IndentDirection } from '../../utils/indentEditor';
import { requestBulkFieldReview, requestFieldReview } from '../../services/llmService';
import { flatten } from '../../utils/flattener';
import type { HistoryEntry } from '../../models/HistoryEntry';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { useFieldHover } from '../../hooks/useFieldHover';
import { useChatSuggestionFlow } from '../../hooks/useChat';
import { useRowIndent } from '../../hooks/useRowIndent';
import { useTableEditor } from '../../hooks/useTableEditor';
import { useReviewQueue } from '../../hooks/useReviewQueue';

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
  const [splitPercent, setSplitPercent] = useState(50);
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

  const [tableKey, setTableKey] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());
  const [chatActiveTab, setChatActiveTab] = useState<'chat' | 'review' | 'history'>('chat');

  const extractedPagesRef = useRef<ExtractedPage[]>([]);
  const currentPageIndexRef = useRef(0);
  useEffect(() => {
    extractedPagesRef.current = extractedPages;
  }, [extractedPages]);
  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

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

  useEffect(() => {
    async function loadSession() {
      try {
        const ocrData = await getExtractionSession(); //IMORTANT NOTE, CHANGE API TO NEW ONE
        setOcrPages(ocrData);
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
    const newExtractedPages: ExtractedPage[] = ocrPages.map((page, _pageIndex) => ({
      ...flatten(page.components),
      pageIndex: page.page_num - 1,
    }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExtractedPages(newExtractedPages);
  }, [ocrPages]);

  // UNDO/REDO PIPELINE — stack + keyboard shortcuts live in the hook; we
  // just say what "apply a snapshot" means for this page's state.
  const {
    push: pushUndo,
    undo: handleUndo,
    redo: handleRedo,
  } = useUndoRedo(extractedPagesRef, {
    onApply: (pages, direction) => {
      setExtractedPages(pages);
      saveExtractionSession(pages);
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
    onPagesChange: setExtractedPages,
    onPersist: saveExtractionSession,
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
      onPageChange: setCurrentPageIndex,
    });

  // AI-suggestion propose/accept/reject flow (chat messages live here too,
  // since they only ever get created in response to accept/reject).
  const { messages, addMessage, handleContextUpdate, handleAccept, handleReject } =
    useChatSuggestionFlow({
      currentPageIndex,
      documentContext,
      extractedPagesRef,
      onPagesChange: setExtractedPages,
      onPersist: saveExtractionSession,
      pushUndo,
    });

  // Row indent/outdent
  const { handleRowIndent, handleRowOutdent } = useRowIndent({
    currentPageIndexRef,
    extractedPagesRef,
    onPagesChange: setExtractedPages,
    onPersist: saveExtractionSession,
    addHistoryEntry,
    pushUndo,
  });

  // Cell/row/column CRUD for the table itself
  const { editCell, addRow, deleteRow, addColumn, deleteColumn, moveRow, reorderColumns } =
    useTableEditor({
      currentPageIndexRef,
      extractedPagesRef,
      onPagesChange: setExtractedPages,
      onPersist: saveExtractionSession,
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

export default ValidationPage;
