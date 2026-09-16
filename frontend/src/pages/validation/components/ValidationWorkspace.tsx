import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Columns2,
  FileText,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
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
import {
  groupPagesByFiles,
  getGlobalIndex,
  getFileAndLocalPage,
  calculateAverageConfidence,
  type FileMetadataInput,
} from '../../../utils/fileGrouping';

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
  /**
   * Stable per-page identifiers, aligned index-for-index with `pages`
   * (e.g. `${documentId}:${pageIndex}`). Passed straight through to
   * useReviewQueue so it can tell "already processed" pages apart from
   * newly-added ones across resyncs.
   */
  pageKeys?: string[];
  /**
   * Changes whenever the *set* of pages changes shape (a page was added or
   * removed) — NOT on every parent re-render. When it changes, `pages` is
   * re-adopted into internal state.
   */
  syncKey?: string;
  /** Optional file metadata describing document boundaries and filenames */
  fileMetadata?: FileMetadataInput[];
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
  pageKeys,
  syncKey,
  fileMetadata,
}: ValidationWorkspaceProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [viewMode, setViewMode] = useState<'split' | 'document' | 'table'>('split');
  const [isPiPOpen, setIsPiPOpen] = useState(true);

  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>(pages);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);

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

  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    setExtractedPages(pages);
    const clamped = Math.min(currentPageIndex, Math.max(pages.length - 1, 0));
    setCurrentPageIndex(clamped);
  }

  useEffect(() => {
    extractedPagesRef.current = extractedPages;
  }, [extractedPages]);

  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditedCells(new Set());
  }, [currentPageIndex]);

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

  // ── File Grouping & Scoped Navigation ────────────────────────────────────
  const fileGroups = useMemo(
    () => groupPagesByFiles(extractedPages, ocrPages, imageUrls, pageKeys, fileMetadata),
    [extractedPages, ocrPages, imageUrls, pageKeys, fileMetadata]
  );

  const { fileIndex: activeFileIndex, pageIndexInFile: activePageIndexInFile } = useMemo(
    () => getFileAndLocalPage(fileGroups, currentPageIndex),
    [fileGroups, currentPageIndex]
  );

  const currentFileGroup = fileGroups[activeFileIndex] ?? fileGroups[0];
  const totalPagesInFile = currentFileGroup?.pages?.length ?? 1;

  const handleSelectFile = useCallback(
    (newFileIndex: number) => {
      if (newFileIndex < 0 || newFileIndex >= fileGroups.length) return;
      const newGlobal = getGlobalIndex(fileGroups, newFileIndex, 0);
      handlePageIndexChange(newGlobal);
    },
    [fileGroups, handlePageIndexChange]
  );

  const handleSelectPageInFile = useCallback(
    (newLocalPage: number) => {
      if (newLocalPage < 0 || newLocalPage >= totalPagesInFile) return;
      const newGlobal = getGlobalIndex(fileGroups, activeFileIndex, newLocalPage);
      handlePageIndexChange(newGlobal);
    },
    [fileGroups, activeFileIndex, totalPagesInFile, handlePageIndexChange]
  );

  // Confidence calculation for top toolbar
  const averageConfidence = calculateAverageConfidence(ocrData);
  const confidencePercent = Math.round(averageConfidence * 100);

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
    pageKeys,
  });

  // Resizing Functions for Split View
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

    // Clamp between 20% and 80%
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
        setFlaggedIssues((prev) =>
          prev.filter(
            (issue) => !(issue.fieldId === fieldId && issue.pageIndex === currentPageIndexRef.current)
          )
        );
      },
    });

  if (!documentContext) {
    return (
      <div className="flex h-screen items-center justify-center font-semibold text-lg">
        Loading...
      </div>
    );
  }

  // Acknowledgment: this code was generated by Google Gemini
  return (
    <div className={`flex flex-col w-full ${heightClassName} overflow-hidden bg-base-100`}>
      {/* ── TOP UNIFIED WORKSPACE BAR ── */}
      <div className="bg-base-200 border-b border-base-300 px-4 py-2 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Left: File Navigator + Scoped Page Navigator */}
        <div className="flex items-center gap-3">
          {/* File Navigator Dropdown & Flick Buttons */}
          <div className="flex items-center bg-base-100 rounded-xl border border-base-300 p-0.5 shadow-sm">
            <button
              onClick={() => handleSelectFile(activeFileIndex - 1)}
              disabled={activeFileIndex <= 0}
              className="btn btn-ghost btn-xs btn-square disabled:opacity-30 h-7 w-7 min-h-0"
              title="Previous File"
              aria-label="Previous File"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="dropdown">
              <label
                tabIndex={0}
                className="btn btn-ghost btn-xs gap-1.5 font-medium normal-case h-7 min-h-0 px-2 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-primary shrink-0" />
                <span
                  data-testid="active-file-name"
                  className="max-w-[160px] sm:max-w-[240px] truncate text-xs"
                  title={currentFileGroup?.fileName || 'Document'}
                >
                  {currentFileGroup?.fileName || 'Document'}
                </span>
                <span className="text-[10px] text-base-content/60 font-normal shrink-0">
                  ({activeFileIndex + 1}/{fileGroups.length})
                </span>
                <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
              </label>
              <ul
                tabIndex={0}
                className="dropdown-content menu p-2 shadow-xl bg-base-100 rounded-box w-80 max-w-[calc(100vw-2rem)] border border-base-300 z-30 overflow-hidden"
              >
                <li className="menu-title text-xs font-semibold px-2 py-1 text-base-content/60">
                  Uploaded Files
                </li>
                {fileGroups.map((fg, idx) => (
                  <li key={fg.fileId || idx}>
                    <button
                      type="button"
                      className={`flex items-center justify-between gap-3 px-2.5 py-2 text-xs rounded-lg transition-colors w-full min-w-0 ${
                        idx === activeFileIndex
                          ? 'active font-semibold bg-primary text-primary-content'
                          : 'hover:bg-base-200'
                      }`}
                      onClick={() => {
                        handleSelectFile(idx);
                        (document.activeElement as HTMLElement)?.blur();
                      }}
                    >
                      <span className="flex items-center gap-2 min-w-0 flex-1">
                        <FileText
                          className={`w-3.5 h-3.5 shrink-0 ${
                            idx === activeFileIndex ? 'text-primary-content' : 'text-primary'
                          }`}
                        />
                        <span className="truncate text-left font-normal" title={fg.fileName}>
                          {fg.fileName}
                        </span>
                      </span>
                      <span
                        className={`badge badge-xs shrink-0 font-medium ${
                          idx === activeFileIndex
                            ? 'badge-ghost bg-primary-content/20 text-primary-content border-none'
                            : 'badge-ghost text-base-content/70'
                        }`}
                      >
                        {fg.pages.length} {fg.pages.length === 1 ? 'page' : 'pages'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={() => handleSelectFile(activeFileIndex + 1)}
              disabled={activeFileIndex >= fileGroups.length - 1}
              className="btn btn-ghost btn-xs btn-square disabled:opacity-30 h-7 w-7 min-h-0"
              title="Next File"
              aria-label="Next File"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Scoped Page Navigation within current file */}
          <div className="flex items-center gap-1 bg-base-100 rounded-xl border border-base-300 px-2 py-0.5 shadow-sm text-xs h-8">
            <span className="text-base-content/60 font-medium mr-1 text-[11px]">Page</span>
            {totalPagesInFile > 1 ? (
              <>
                <button
                  onClick={() => handleSelectPageInFile(activePageIndexInFile - 1)}
                  disabled={activePageIndexInFile <= 0}
                  className="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0 disabled:opacity-30"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>

                <div className="flex items-center gap-1">
                  {totalPagesInFile <= 8 ? (
                    Array.from({ length: totalPagesInFile }).map((_, pIdx) => (
                      <button
                        key={pIdx}
                        onClick={() => handleSelectPageInFile(pIdx)}
                        className={`btn btn-xs h-6 min-h-0 px-2 rounded-lg text-xs transition-all ${
                          pIdx === activePageIndexInFile
                            ? 'btn-primary font-bold shadow-xs'
                            : 'btn-ghost hover:bg-base-200'
                        }`}
                      >
                        {pIdx + 1}
                      </button>
                    ))
                  ) : (
                    <span className="px-1.5 font-medium">
                      {activePageIndexInFile + 1} / {totalPagesInFile}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => handleSelectPageInFile(activePageIndexInFile + 1)}
                  disabled={activePageIndexInFile >= totalPagesInFile - 1}
                  className="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0 disabled:opacity-30"
                  title="Next Page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <span className="font-semibold text-xs px-1 text-base-content/80">
                1 of 1
              </span>
            )}
          </div>

          {/* Average Confidence Badge */}
          <div
            className="hidden sm:flex items-center gap-1.5 text-xs text-base-content/70"
            title="Overall OCR Confidence for this document"
          >
            <span>Confidence:</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                confidencePercent >= 85
                  ? 'border-success text-success bg-base-100'
                  : confidencePercent >= 70
                    ? 'border-warning text-warning bg-base-100'
                    : 'border-error text-error bg-base-100'
              }`}
            >
              {confidencePercent}%
            </span>
          </div>
        </div>

        {/* Right: View Mode Switcher + Global Actions */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle: Split / Document / Table */}
          <div className="join bg-base-100 border border-base-300 rounded-xl p-0.5 shadow-sm">
            <button
              onClick={() => setViewMode('split')}
              className={`btn btn-xs join-item rounded-lg gap-1 h-7 min-h-0 ${
                viewMode === 'split' ? 'btn-primary shadow-xs' : 'btn-ghost'
              }`}
              title="Side-by-side Split View"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">Split</span>
            </button>
            <button
              onClick={() => setViewMode('document')}
              className={`btn btn-xs join-item rounded-lg gap-1 h-7 min-h-0 ${
                viewMode === 'document' ? 'btn-primary shadow-xs' : 'btn-ghost'
              }`}
              title="Document Full Focus View"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">Document</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`btn btn-xs join-item rounded-lg gap-1 h-7 min-h-0 ${
                viewMode === 'table' ? 'btn-primary shadow-xs' : 'btn-ghost'
              }`}
              title="Table Full Focus View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">Table</span>
            </button>
          </div>

          {/* Quick Undo Button */}
          <button
            onClick={handleUndo}
            className="btn btn-ghost btn-xs btn-square rounded-xl h-7 w-7 min-h-0"
            title="Undo last change (⌘Z / Ctrl+Z)"
            aria-label="Undo"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── WORKSPACE BODY ── */}
      <div
        ref={containerRef}
        className="flex flex-col lg:flex-row w-full p-3 gap-3 flex-1 min-h-0 relative overflow-hidden"
      >
        {/* Document Panel (Rendered in 'split' or 'document' mode) */}
        {(viewMode === 'split' || viewMode === 'document') && (
          <div
            className="h-full transition-all duration-200"
            style={
              viewMode === 'document'
                ? { width: '100%' }
                : isLarge
                  ? { width: `${splitPercent}%` }
                  : { width: '100%' }
            }
          >
            <DocumentPanel
              hoveredOverlayIds={hoveredDocumentOverlayIds}
              documentImageUrl={documentImageURL}
              ocrData={ocrData}
              imageUrls={imageUrls}
              currentPageIndex={currentPageIndex}
              onPageChange={handlePageIndexChange}
              hideThumbnails={true}
            />
          </div>
        )}

        {/* Resizer divider (Only in 'split' mode on large screens) */}
        {viewMode === 'split' && (
          <div
            onMouseDown={onMouseDown}
            onDoubleClick={() => setSplitPercent(50)}
            className="hidden lg:flex items-center justify-center w-2 mx-1 cursor-col-resize flex-shrink-0 group"
            title="Drag to resize panels (Double-click to reset 50/50)"
          >
            <div className="w-1 h-12 rounded-full bg-gray-300 group-hover:bg-blue-400 transition-colors duration-150" />
          </div>
        )}

        {/* Extracted Data Table Panel (Rendered in 'split' or 'table' mode) */}
        {(viewMode === 'split' || viewMode === 'table') && (
          <div
            className="h-full relative transition-all duration-200 flex-1 min-w-0"
            style={
              viewMode === 'table'
                ? { width: '100%' }
                : isLarge
                  ? { width: `${100 - splitPercent}%` }
                  : { width: '100%' }
            }
          >
            <ExtractedDataPanel
              onUndoLast={handleUndo}
              key={`${tableKey}-${currentPageIndex}`}
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

            {/* Picture-in-Picture (PiP) mini document preview when in Table Focus Mode */}
            {viewMode === 'table' && isPiPOpen && (
              <div className="absolute bottom-4 left-4 z-20 w-80 h-56 bg-base-100/95 border border-base-300 rounded-xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-md">
                <div className="bg-base-200 px-3 py-1.5 border-b border-base-300 flex items-center justify-between text-xs font-semibold text-base-content/80">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    Document Preview
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setViewMode('split')}
                      className="btn btn-ghost btn-xs h-5 px-1.5 text-[10px] gap-1"
                      title="Switch to Split View"
                    >
                      <Columns2 className="w-3 h-3" /> Expand
                    </button>
                    <button
                      onClick={() => setIsPiPOpen(false)}
                      className="btn btn-ghost btn-xs btn-circle h-5 w-5 min-h-0"
                      title="Hide preview"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="flex-1 relative overflow-hidden bg-base-300/30">
                  <DocumentPanel
                    hoveredOverlayIds={hoveredDocumentOverlayIds}
                    documentImageUrl={documentImageURL}
                    ocrData={ocrData}
                    currentPageIndex={currentPageIndex}
                    hideThumbnails={true}
                    compactMode={true}
                  />
                </div>
              </div>
            )}

            {/* Floating button to restore PiP if dismissed in Table mode */}
            {viewMode === 'table' && !isPiPOpen && (
              <button
                onClick={() => setIsPiPOpen(true)}
                className="absolute bottom-4 left-4 z-20 btn btn-xs btn-outline bg-base-100/90 shadow-md gap-1.5 rounded-lg text-xs"
                title="Show Picture-in-Picture document preview"
              >
                <FileText className="w-3.5 h-3.5 text-primary" /> Show Document Preview
              </button>
            )}
          </div>
        )}
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
    </div>
  );
}

export default ValidationWorkspace;
