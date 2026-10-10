import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Columns2,
  FileText,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  RefreshCw,
} from 'lucide-react';
import DocumentPanel from './document/DocumentPanel';
import DocumentPreviewPiP from './document/DocumentPreviewPiP';
import ExtractedDataPanel from './extracted-data/ExtractedDataPanel';
import ChatPanel, { type AssistantDockMode } from './chat/ChatPanel';
import type { Block } from '../../../models/Document';
import type { ExtractedPage } from '../../../models/TableData';
import { listTables, switchActiveTable } from '../../../utils/flattener';
import {
  blocksToOverlays,
  averageOverlayConfidence,
  type PageOverlay,
} from '../../../utils/overlays';
import type { HistoryEntry } from '../../../models/HistoryEntry';
import { useUndoRedo } from '../../../hooks/useUndoRedo';
import { useFieldHover } from '../../../hooks/useFieldHover';
import { useChatSuggestionFlow } from '../../../hooks/useChat';
import { useRowIndent } from '../../../hooks/useRowIndent';
import { useTableEditor } from '../../../hooks/useTableEditor';
import { useReviewQueue } from '../../../hooks/review/useReviewQueue';
import {
  groupPagesByFiles,
  getGlobalIndex,
  getFileAndLocalPage,
  type FileMetadataInput,
} from '../../../utils/fileGrouping';
import type { PageReview, ReviewsByPage } from '../../../models/IssueReview';

type ViewMode = 'split' | 'document' | 'table';
type ChatTab = 'chat' | 'review' | 'history';

/** Remembers whether the assistant was docked or floating. */
const DOCK_MODE_STORAGE_KEY = 'arkhive.assistantDockMode';

/** Below this body width the document and table stack instead of sitting side by side. */
const SPLIT_MIN_WIDTH = 720;

/**
 * True when `ref`'s element is at least `minWidth` wide. Measured on the
 * element itself (not the viewport) so the split/stacked decision accounts
 * for the docked assistant panel taking space from the workspace body.
 */
function useIsWide(ref: React.RefObject<HTMLElement | null>, minWidth: number, enabled: boolean) {
  const [isWide, setIsWide] = useState(() => window.innerWidth >= 1024);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const observer = new ResizeObserver(([entry]) => {
      setIsWide(entry.contentRect.width >= minWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, minWidth, enabled]);

  return isWide;
}

export interface ValidationWorkspaceProps {
  /** The pages to validate, adopted into internal state whenever `syncKey` changes. */
  pages: ExtractedPage[];
  /**
   * Structured blocks per page (StructuredPage.blocks), aligned index-for-index
   * with `pages`. Converted internally to highlightable overlays.
   */
  ocrPages: Block[][];
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
  /** Persisted reviews to hydrate from. Keep the reference stable (useMemo). */
  initialReviews?: ReviewsByPage;
  /** Called with a page's new review whenever it changes. */
  onReviewChange?: (pageKey: string, review: PageReview) => void;
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
  initialReviews,
  onReviewChange,
  syncKey,
  fileMetadata,
}: ValidationWorkspaceProps) {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [isPiPOpen, setIsPiPOpen] = useState(true);

  const [extractedPages, setExtractedPages] = useState<ExtractedPage[]>(pages);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);

  const documentContext: ExtractedPage | null = extractedPages[currentPageIndex] ?? null;
  // Block IR -> highlightable regions for the document panel. Recomputed only
  // when the blocks themselves change (cell edits don't move regions).
  const overlayPages = useMemo<PageOverlay[][]>(() => ocrPages.map(blocksToOverlays), [ocrPages]);
  const overlays: PageOverlay[] = overlayPages[currentPageIndex] ?? [];
  const documentImageURL: string | undefined = imageUrls[currentPageIndex];

  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isLarge = useIsWide(containerRef, SPLIT_MIN_WIDTH, documentContext !== null);

  const [tableKey, setTableKey] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());
  const [chatActiveTab, setChatActiveTab] = useState<ChatTab>('chat');
  const [editedBlockIds, setEditedBlockIds] = useState<Set<string>>(new Set());
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  // Docked = side panel that takes layout space. Floating = movable window
  // over the page that takes none. Remembered between sessions.
  const [dockMode, setDockMode] = useState<AssistantDockMode>(() => {
    try {
      return localStorage.getItem(DOCK_MODE_STORAGE_KEY) === 'floating' ? 'floating' : 'docked';
    } catch {
      return 'docked';
    }
  });

  const handleDockModeChange = useCallback((mode: AssistantDockMode) => {
    setDockMode(mode);
    try {
      localStorage.setItem(DOCK_MODE_STORAGE_KEY, mode);
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, []);

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
    setEditedBlockIds(new Set());
  }, [currentPageIndex]);

  const handlePagesChange = useCallback((action: React.SetStateAction<ExtractedPage[]>) => {
    const next = typeof action === 'function' ? action(extractedPagesRef.current) : action;
    extractedPagesRef.current = next;
    setExtractedPages(next);
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
    () => groupPagesByFiles(extractedPages, overlayPages, imageUrls, pageKeys, fileMetadata),
    [extractedPages, overlayPages, imageUrls, pageKeys, fileMetadata]
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
  const averageConfidence = averageOverlayConfidence(overlays);
  const confidencePercent = averageConfidence === null ? null : Math.round(averageConfidence * 100);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyRedo, setRedoHistory] = useState<HistoryEntry[]>([]);

  const addHistoryEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setHistory((prev) => [
      {
        ...entry,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
    setRedoHistory([]);
  }, []);

  const undoRedoHistoryEntry = useCallback(
    (direction: 'undo' | 'redo') => {
      if (direction === 'undo') {
        const undoChange = history[0];

        if (!undoChange) return;

        setHistory((prev) => prev.slice(1));

        setRedoHistory((prev) => [undoChange, ...prev]);
      } else {
        const redoChange = historyRedo[0];

        if (!redoChange) return;

        setRedoHistory((prev) => prev.slice(1));

        setHistory((prev) => [
          {
            ...redoChange,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    },
    [history, historyRedo]
  );

  // UNDO/REDO PIPELINE — stack + keyboard shortcuts live in the hook; we
  // just say what "apply a snapshot" means for this workspace's state.
  const { push: pushUndo, undo: handleUndo } = useUndoRedo(extractedPagesRef, {
    onApply: (updatedPages, direction) => {
      setExtractedPages(updatedPages);
      onPersist(updatedPages);
      setEditedCells(new Set());
      setTableKey((k) => k + 1);
      // addHistoryEntry({
      //   type: direction,
      //   description: direction === 'undo' ? 'Undid last change' : 'Redid last change',
      // });
      undoRedoHistoryEntry(direction);
    },
  });

  // REVIEW QUEUE — confidence/format detection, carousel accept/reject/edit,
  // and AI suggestion fetches. See src/hooks/useReviewQueue.ts.
  const {
    flaggedIssues,
    currentPageStatus,
    rescanCurrentPage,
    handleCarouselAccept,
    handleCarouselReject,
    handleCarouselManualEdit,
    handleCellEdited,
    handleColumnRenamed,
    handleFetchSuggestion,
    handleFetchBulkSuggestion,
  } = useReviewQueue({
    extractedPages,
    currentPageIndex,
    currentPageIndexRef,
    extractedPagesRef,
    onPagesChange: handlePagesChange,
    onPersist,
    addHistoryEntry,
    pushUndo,
    onIssuesDetected: () => setChatActiveTab('review'),
    pageKeys,
    initialReviews,
    onReviewChange,
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
      addHistoryEntry,
      onCellsEdited: (cells) => {
        const ids = cells.map((c) => `${c.rowId}:${c.column}`);
        setEditedCells((prev) => new Set([...prev, ...ids]));
        ids.forEach(handleCellEdited);
      },
      onBlocksEdited: (ids) => setEditedBlockIds((prev) => new Set([...prev, ...ids])),
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
  const {
    editCell,
    addRow,
    deleteRow,
    addColumn,
    deleteColumn,
    renameColumn,
    moveRow,
    reorderColumns,
    setIndentColumn,
  } = useTableEditor({
    currentPageIndexRef,
    extractedPagesRef,
    onPagesChange: handlePagesChange,
    onPersist,
    addHistoryEntry,
    pushUndo,
    onCellEdited: (fieldId) => {
      setEditedCells((prev) => new Set(prev).add(fieldId));
      handleCellEdited(fieldId);
    },
    onColumnRenamed: (oldName, newName) => {
      setEditedCells((prev) => {
        const next = new Set<string>();
        const oldSuffix = `:${oldName}`;
        for (const cellId of prev) {
          next.add(
            cellId.endsWith(oldSuffix) ? `${cellId.slice(0, -oldSuffix.length)}:${newName}` : cellId
          );
        }
        return next;
      });
      handleColumnRenamed(oldName, newName);
    },
  });

  // ── Multi-table + field/text blocks ──────────────────────────────────────
  const tableTabs = useMemo(
    () => (documentContext ? listTables(documentContext) : []),
    [documentContext]
  );

  // Switching tables only changes which table is loaded into the grid; it is
  // not a data edit, so it is neither persisted nor pushed onto the undo stack.
  const handleSelectTable = useCallback(
    (tableId: string) => {
      handlePagesChange((prev) =>
        prev.map((p, i) => (i === currentPageIndexRef.current ? switchActiveTable(p, tableId) : p))
      );
      setEditedCells(new Set());
    },
    [handlePagesChange]
  );

  // Field values and text blocks aren't touched by the table hooks, so edits
  // are applied here, then undo-snapshotted and persisted like any other edit.
  const handleBlockEdit = useCallback(
    (blockId: string, newValue: string) => {
      // pushUndo();
      handlePagesChange((prev) =>
        prev.map((p, i) =>
          i !== currentPageIndexRef.current
            ? p
            : {
                ...p,
                fields: p.fields?.map((f) => (f.id === blockId ? { ...f, value: newValue } : f)),
                texts: p.texts?.map((t) => (t.id === blockId ? { ...t, text: newValue } : t)),
              }
        )
      );
      onPersist(extractedPagesRef.current);
      setEditedBlockIds((prev) => new Set(prev).add(blockId));
    },
    [handlePagesChange, onPersist]
  );

  // Field/text hover has no table cell behind it, so it bypasses useFieldHover
  // and highlights the block's own overlay (overlay id === block id).
  const documentHighlightIds = useMemo(
    () =>
      hoveredBlockId ? [...hoveredDocumentOverlayIds, hoveredBlockId] : hoveredDocumentOverlayIds,
    [hoveredDocumentOverlayIds, hoveredBlockId]
  );

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
                          ? 'active font-semibold bg-primary text-base-100'
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
                            idx === activeFileIndex ? 'text-base-100' : 'text-primary'
                          }`}
                        />
                        <span className="truncate text-left font-normal" title={fg.fileName}>
                          {fg.fileName}
                        </span>
                      </span>
                      <span
                        className={`badge badge-xs shrink-0 font-medium ${
                          idx === activeFileIndex
                            ? 'badge-ghost bg-primary-content/20 text-base-100 border-none'
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
                            ? 'btn-primary font-bold shadow-xs text-base-100'
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
              <span className="font-semibold text-xs px-1 text-base-content/80">1 of 1</span>
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
                confidencePercent === null
                  ? 'border-base-300 text-base-content/50 bg-base-100'
                  : confidencePercent >= 85
                    ? 'border-success text-success bg-base-100'
                    : confidencePercent >= 70
                      ? 'border-warning text-warning bg-base-100'
                      : 'border-error text-error bg-base-100'
              }`}
            >
              {confidencePercent === null ? '—' : `${confidencePercent}%`}
            </span>
          </div>

          {/* Re-scan Current Page Button */}
          <button
            type="button"
            onClick={rescanCurrentPage}
            disabled={currentPageStatus?.scanning}
            className={`btn btn-xs h-8 min-h-0 px-2.5 rounded-xl border border-base-300 bg-base-100 shadow-sm gap-1.5 text-xs font-medium transition-all ${
              currentPageStatus && !currentPageStatus.formatCheckOk
                ? 'border-warning text-warning hover:bg-warning/10'
                : 'hover:bg-base-200 text-base-content/80'
            }`}
            title={
              currentPageStatus && !currentPageStatus.formatCheckOk
                ? `Format check failed on page ${activePageIndexInFile + 1}. Click to re-scan.`
                : `Re-scan page ${activePageIndexInFile + 1} for confidence & format issues`
            }
            aria-label={`Re-scan page ${activePageIndexInFile + 1}`}
          >
            {currentPageStatus?.scanning ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  currentPageStatus && !currentPageStatus.formatCheckOk
                    ? 'text-warning'
                    : 'text-base-content/70'
                }`}
              />
            )}
            <span className="hidden sm:inline">
              {currentPageStatus?.scanning ? 'Scanning...' : 'Re-scan Page'}
            </span>
          </button>
        </div>

        {/* Right: View Mode Switcher + Global Actions */}
        <div className="flex items-center gap-2">
          {/* View Mode Toggle: Split / Document / Table */}
          <div className="join bg-base-100 border border-base-300 rounded-xl p-0.5 shadow-sm">
            <button
              onClick={() => setViewMode('split')}
              className={`btn btn-xs join-item rounded-lg gap-1 h-7 min-h-0 ${
                viewMode === 'split' ? 'btn-primary shadow-xs text-base-100' : 'btn-ghost'
              }`}
              title="Side-by-side Split View"
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">Split</span>
            </button>
            <button
              onClick={() => setViewMode('document')}
              className={`btn btn-xs join-item rounded-lg gap-1 h-7 min-h-0 ${
                viewMode === 'document' ? 'btn-primary shadow-xs text-base-100' : 'btn-ghost'
              }`}
              title="Document Full Focus View"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">Document</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`btn btn-xs join-item rounded-lg gap-1 h-7 min-h-0 ${
                viewMode === 'table' ? 'btn-primary shadow-xs text-base-100' : 'btn-ghost'
              }`}
              title="Table Full Focus View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden md:inline text-xs">Table</span>
            </button>
          </div>

          {/* Table Mode: Document Preview Toggle */}
          {viewMode === 'table' && (
            <button
              onClick={() => setIsPiPOpen(!isPiPOpen)}
              className={`btn btn-xs rounded-lg gap-1.5 h-7 min-h-0 text-xs ${
                isPiPOpen ? 'btn-primary shadow-xs text-base-100' : 'btn-outline'
              }`}
              title={
                isPiPOpen
                  ? 'Hide Picture-in-Picture document preview'
                  : 'Show Picture-in-Picture document preview'
              }
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {isPiPOpen ? 'Hide Preview' : 'Document Preview'}
              </span>
            </button>
          )}

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

      {/* ── WORKSPACE BODY + DOCKED AI ASSISTANT ── */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
        <div
          ref={containerRef}
          className={`flex ${isLarge ? 'flex-row' : 'flex-col'} flex-1 min-w-0 p-3 gap-3 min-h-0 relative overflow-hidden`}
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
                hoveredOverlayIds={documentHighlightIds}
                documentImageUrl={documentImageURL}
                ocrData={overlays}
                imageUrls={imageUrls}
                currentPageIndex={currentPageIndex}
                onPageChange={handlePageIndexChange}
                hideThumbnails={true}
              />
            </div>
          )}

          {/* Resizer divider (Only in 'split' mode on large screens) */}
          {viewMode === 'split' && isLarge && (
            <div
              onMouseDown={onMouseDown}
              onDoubleClick={() => setSplitPercent(50)}
              className="flex items-center justify-center w-2 mx-1 cursor-col-resize flex-shrink-0 group"
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
                key={`${tableKey}-${currentPageIndex}-${documentContext.tableId ?? 'none'}`}
                isEditMode={isEditMode}
                onEditModeChange={setIsEditMode}
                editedCells={editedCells}
                onHover={(id) => {
                  if (isChatOpen && chatActiveTab === 'review') return;
                  handleHover(id);
                }}
                extractedData={documentContext}
                fileGroups={fileGroups}
                currentGlobalIndex={currentPageIndex}
                hoveredOverlayIds={hoveredTableFieldIds}
                onRowIndent={handleRowIndent}
                onRowOutdent={handleRowOutdent}
                onCellEdit={editCell}
                onRowAdd={addRow}
                onRowDelete={deleteRow}
                onColumnAdd={addColumn}
                onColumnDelete={deleteColumn}
                onColumnRename={renameColumn}
                onRowMove={moveRow}
                onColumnReorder={reorderColumns}
                onIndentColumnChange={setIndentColumn}
                tables={tableTabs}
                activeTableId={documentContext.tableId}
                onSelectTable={handleSelectTable}
                fields={documentContext.fields}
                texts={documentContext.texts}
                editedBlockIds={editedBlockIds}
                onBlockEdit={handleBlockEdit}
                onBlockHover={setHoveredBlockId}
              />

              {/* Picture-in-Picture (PiP) mini document preview when in Table Focus Mode */}
              {viewMode === 'table' && isPiPOpen && (
                <DocumentPreviewPiP
                  documentImageUrl={documentImageURL}
                  ocrData={overlays}
                  currentPageIndex={currentPageIndex}
                  hoveredOverlayIds={documentHighlightIds}
                  onClose={() => setIsPiPOpen(false)}
                  containerRef={containerRef}
                />
              )}
            </div>
          )}
        </div>

        {/* AI assistant (chat / review / history). Docked: a resizable, collapsible
          column beside the document + table. Floating: a draggable window that
          takes no layout space. The user switches between the two. */}
        <ChatPanel
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen((open) => !open)}
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
          dockMode={dockMode}
          onDockModeChange={handleDockModeChange}
          formatCheckFailed={Boolean(currentPageStatus && !currentPageStatus.formatCheckOk)}
          history={history}
        />
      </div>
    </div>
  );
}

export default ValidationWorkspace;
