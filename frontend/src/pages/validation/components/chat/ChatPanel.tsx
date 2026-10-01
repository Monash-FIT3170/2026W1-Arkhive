import {
  Bot,
  History as HistoryIcon,
  ListChecks,
  MessageSquare,
  Minus,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  PictureInPicture2,
  Send,
  X,
} from 'lucide-react';
import type { ChatMessage } from '../../../../models/Message';
import MessageItem from './MessageItem';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sendMessage } from '../../../../services/llmService';
import type { ExtractedPage } from '../../../../models/TableData';
import { useFloatingWindow, type ResizeDirection } from '../../../../hooks/useFloatingWindow';

import OcrReviewWidget from './OcrReviewWidget';

import type { HistoryEntry } from '../../../../models/HistoryEntry';
import type { OcrIssue } from '../../../../models/IssueReview';
import { buildSlides } from '../../../../utils/review/ocrReviewUtils';

type Tab = 'chat' | 'review' | 'history';

/** `docked` = side panel that takes layout space; `floating` = movable window over the page. */
export type DockMode = 'docked' | 'floating';
export type AssistantDockMode = DockMode;

// Docked panel sizing
const MIN_WIDTH = 320;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 384;
const KEYBOARD_STEP = 24;
const WIDTH_STORAGE_KEY = 'arkhive.assistantPanelWidth';

// Floating window sizing
const FLOAT_STORAGE_KEY = 'arkhive.assistantFloatingRect';
const FLOAT_DEFAULT_SIZE = { width: 400, height: 560 };
const FLOAT_MIN_SIZE = { width: 320, height: 380 };

/**
 * Distance from the viewport's bottom/right edge to the centre of the round
 * button (24px offset + half of the 64px button). The window shrinks toward,
 * and grows out of, this point.
 */
const FAB_CENTER_OFFSET = 56;

/** Edge and corner hit areas for the floating window (mirrors DocumentPreviewPiP). */
const RESIZE_HANDLES: { direction: ResizeDirection; className: string }[] = [
  { direction: 'nw', className: 'top-0 left-0 w-3 h-3 cursor-nwse-resize' },
  { direction: 'ne', className: 'top-0 right-0 w-3 h-3 cursor-nesw-resize' },
  { direction: 'sw', className: 'bottom-0 left-0 w-3 h-3 cursor-nesw-resize' },
  { direction: 'se', className: 'bottom-0 right-0 w-4 h-4 cursor-nwse-resize' },
  { direction: 'n', className: 'top-0 left-3 right-3 h-1.5 cursor-ns-resize' },
  { direction: 's', className: 'bottom-0 left-3 right-3 h-1.5 cursor-ns-resize' },
  { direction: 'w', className: 'top-3 bottom-3 left-0 w-1.5 cursor-ew-resize' },
  { direction: 'e', className: 'top-3 bottom-3 right-0 w-1.5 cursor-ew-resize' },
];

/** Keeps the docked panel from eating more than 60% of the viewport. */
const clampWidth = (w: number) => {
  const viewportCap = typeof window !== 'undefined' ? window.innerWidth * 0.6 : MAX_WIDTH;
  return Math.round(Math.min(Math.max(w, MIN_WIDTH), Math.min(MAX_WIDTH, viewportCap)));
};

const readStoredWidth = () => {
  try {
    const raw = localStorage.getItem(WIDTH_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? clampWidth(parsed) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
};

/**
 * AI assistant with two layouts, like the document preview:
 *
 *  - docked:   a side panel beside the document/table. Resizable by dragging
 *              its left edge (or ←/→ when the handle is focused, double-click
 *              to reset), collapsible to a slim rail.
 *  - floating: a window you can drag by its header and resize from any edge
 *              or corner. It takes no layout space, so the document and table
 *              get the full width. Collapsing it leaves a round button.
 */
function ChatPanel({
  isOpen,
  onToggle,
  dockMode = 'docked',
  onDockModeChange,
  messages,
  onAddMessage,
  documentContext,
  onContextUpdate,
  onAccept,
  onReject,
  flaggedIssues = [],
  onCarouselAccept,
  onCarouselReject,
  onCarouselManualEdit,
  onSlideChange,
  onFetchSuggestion,
  onFetchBulkSuggestion,
  activeTab = 'chat',
  onTabChange,
  onRescan,
  isRescanning,
  formatCheckFailed,
  history = [],
}: {
  isOpen: boolean;
  onToggle: () => void;
  dockMode?: DockMode;
  onDockModeChange?: (mode: DockMode) => void;
  messages: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  documentContext: ExtractedPage;
  onContextUpdate: (updated: ExtractedPage) => void;
  onAccept: () => void;
  onReject: () => void;
  flaggedIssues?: OcrIssue[];
  onCarouselAccept?: (updates: { fieldId: string; newValue: string }[]) => void;
  onCarouselReject?: (fieldIds: string[]) => void;
  onCarouselManualEdit?: (fieldId: string, newValue: string) => void;
  onSlideChange?: (fieldIds: string[], pageIndex?: number) => void;
  onFetchSuggestion?: (fieldId: string) => Promise<string | null>;
  onFetchBulkSuggestion?: (
    column: string,
    fields: { fieldId: string; rowId: string | number; ocrValue: string }[],
    formatRegex?: string
  ) => Promise<Record<string, string> | null>;
  activeTab?: Tab;
  onTabChange?: (tab: Tab) => void;

  /** Re-scans the page currently in view, discarding its review state. */
  onRescan?: () => void;
  isRescanning?: boolean;
  /** True when the LLM format check failed for the current page. */
  formatCheckFailed?: boolean;

  history?: HistoryEntry[];
}) {
  const [input, setInput] = useState('');
  const [isLoading, setLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isFloating = dockMode === 'floating';

  // --- docked sizing ------------------------------------------------------
  const [width, setWidth] = useState<number>(readStoredWidth);
  const [isDragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, width: DEFAULT_WIDTH });

  const persistWidth = useCallback((w: number) => {
    try {
      localStorage.setItem(WIDTH_STORAGE_KEY, String(w));
    } catch {
      /* storage unavailable: width just won't persist */
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, width };
    setDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    // Panel is anchored right, so dragging left (smaller clientX) widens it.
    setWidth(clampWidth(dragStart.current.width + (dragStart.current.x - e.clientX)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    persistWidth(width);
  };

  const handleResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = clampWidth(width + (e.key === 'ArrowLeft' ? KEYBOARD_STEP : -KEYBOARD_STEP));
    setWidth(next);
    persistWidth(next);
  };

  const resetWidth = () => {
    setWidth(DEFAULT_WIDTH);
    persistWidth(DEFAULT_WIDTH);
  };

  // Re-clamp when the window shrinks so the document never gets squeezed out.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // --- floating window ----------------------------------------------------
  const {
    rect,
    isInteracting,
    dragProps,
    resizeProps,
    reset: resetFloating,
  } = useFloatingWindow({
    storageKey: FLOAT_STORAGE_KEY,
    defaultSize: FLOAT_DEFAULT_SIZE,
    minSize: FLOAT_MIN_SIZE,
  });

  // --- minimize / restore animation --------------------------------------
  // `out`: window shrinks into the round button, then the parent collapses it.
  // `in`:  window grows back out of the button. Skipped for reduced motion.
  const [floatAnim, setFloatAnim] = useState<'in' | 'out' | null>(null);
  const [fabPop, setFabPop] = useState(false);

  const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const finishMinimize = useCallback(() => {
    setFabPop(true);
    setFloatAnim(null);
    onToggle();
  }, [onToggle]);

  const minimizeFloating = () => {
    if (prefersReducedMotion()) {
      onToggle();
      return;
    }
    setFloatAnim('out');
  };

  const openFromFab = () => {
    if (!prefersReducedMotion()) setFloatAnim('in');
    onToggle();
  };

  const handleFloatAnimationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // ignore animations on child elements
    if (floatAnim === 'out') finishMinimize();
    else if (floatAnim === 'in') setFloatAnim(null);
  };

  // Safety net: if the animationend event never fires (tab in background,
  // animations disabled), still collapse instead of leaving a dead window.
  useEffect(() => {
    if (floatAnim !== 'out') return;
    const timer = window.setTimeout(finishMinimize, 450);
    return () => window.clearTimeout(timer);
  }, [floatAnim, finishMinimize]);

  // --- review badge -------------------------------------------------------
  // `flaggedIssues` only ever contains open issues now; resolved ones are
  // tracked (and persisted) by useReviewQueue and never reach this component.
  const unresolvedSlideCount = useMemo(() => buildSlides(flaggedIssues).length, [flaggedIssues]);

  useEffect(() => {
    // whenever messages change, scroll to the bottom of the chat
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- chat ---------------------------------------------------------------
  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    onAddMessage(userMsg);
    setInput('');
    setLoading(true);
    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('model' as const),
      content: m.content,
    }));

    try {
      const reply = await sendMessage(allMessages, documentContext);

      // ai returns updated context
      if (reply.updatedContext) {
        onContextUpdate({
          ...reply.updatedContext,
          pageIndex: documentContext.pageIndex,
        });
      }

      onAddMessage({
        id: crypto.randomUUID(),
        role: 'model',
        content: reply.response,
        timestamp: new Date().toISOString(),
        intent: reply.intent ?? undefined, // attach intent
      });
    } catch {
      const message =
        'Error: Chatbot service failed. Please double check your Chatbot service credentials';
      onAddMessage({
        id: crypto.randomUUID(),
        role: 'model',
        content: message,
        timestamp: new Date().toISOString(),
      });
      // The panel no longer auto-closes on error: the failure message is in
      // the thread, and the toast covers the collapsed state.
      setChatError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Rail shortcut: expand the panel straight onto a given tab. */
  const openTab = (tab: Tab) => {
    onTabChange?.(tab);
    if (!isOpen) onToggle();
  };

  const tabClass = (tab: Tab) =>
    `pb-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${
      activeTab === tab
        ? 'border-primary text-primary'
        : 'border-transparent text-base-content/60 hover:text-base-content'
    }`;

  // Window position/size as CSS variables (desktop) plus the genie animation,
  // whose transform origin is the round button, expressed in window coordinates.
  const isDesktop = window.innerWidth >= 768;
  const originX = window.innerWidth - FAB_CENTER_OFFSET - (isDesktop ? rect.x : 0);
  const originY = window.innerHeight - FAB_CENTER_OFFSET - (isDesktop ? rect.y : 0);
  const floatStyle = {
    '--fx': `${rect.x}px`,
    '--fy': `${rect.y}px`,
    '--fw': `${rect.width}px`,
    '--fh': `${rect.height}px`,
    transformOrigin: `${originX}px ${originY}px`,
    animation:
      floatAnim === 'out'
        ? 'assistant-genie-out 240ms cubic-bezier(0.4, 0, 1, 1) forwards'
        : floatAnim === 'in'
          ? 'assistant-genie-in 300ms cubic-bezier(0.16, 1, 0.3, 1)'
          : undefined,
  } as React.CSSProperties;

  // Header buttons must not start a window drag.
  const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

  // --- shared body: tabs + tab content (identical in both layouts) --------
  const tabsBar = (
    <div role="tablist" className="flex px-4 gap-6 mt-1">
      <button
        role="tab"
        aria-selected={activeTab === 'chat'}
        className={tabClass('chat')}
        onClick={() => onTabChange?.('chat')}
      >
        Chat
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'review'}
        className={tabClass('review')}
        onClick={() => onTabChange?.('review')}
      >
        Review
        {unresolvedSlideCount > 0 && (
          <span className="badge badge-error badge-sm text-white">{unresolvedSlideCount}</span>
        )}
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'history'}
        className={tabClass('history')}
        onClick={() => onTabChange?.('history')}
      >
        History
        {history.length > 0 && (
          <span className="badge badge-neutral badge-sm">{history.length}</span>
        )}
      </button>
    </div>
  );

  const tabContent =
    activeTab === 'review' ? (
      <div className="flex-1 min-h-0 overflow-hidden">
        <OcrReviewWidget
          issues={flaggedIssues}
          onAccept={onCarouselAccept!}
          onReject={onCarouselReject!}
          onManualEdit={onCarouselManualEdit!}
          onSlideChange={onSlideChange}
          onFetchSuggestion={onFetchSuggestion}
          onFetchBulkSuggestion={onFetchBulkSuggestion}
          onRescan={onRescan}
          isRescanning={isRescanning}
          formatCheckFailed={formatCheckFailed}
        />
      </div>
    ) : activeTab === 'chat' ? (
      <>
        {/* messages area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
          <div className="chat chat-start">
            <div className="chat-image avatar">
              <div className="w-10 rounded-full bg-base-300 flex items-center justify-center">
                <Bot className="w-7 h-7 text-primary" />
              </div>
            </div>
            <div className="chat-header text-xs opacity-50 mb-1">AI Assistant</div>
            <div
              className="chat-bubble chat-bubble-primary text-primary-content"
              style={{ boxShadow: 'var(--color-secondary)' }}
            >
              Hi there, I'm Arkhive's Virtual Assistant. What would you like to do today?
            </div>
          </div>
          {messages.map((msg) => (
            <MessageItem key={msg.id} msg={msg} onAccept={onAccept} onReject={onReject} />
          ))}
          {isLoading && (
            <div className="chat chat-start">
              <div className="chat-image avatar">
                <div className="w-10 rounded-full bg-base-300 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-primary" />
                </div>
              </div>
              <div className="chat-header text-xs opacity-50 mb-1">AI Assistant</div>
              <div
                className="chat-bubble chat-bubble-primary text-primary-content"
                style={{ boxShadow: 'var(--color-secondary)' }}
              >
                <span>Just a moment</span>
                <span className="loading loading-dots loading-sm ml-1.5"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* text input area */}
        <div className="p-4 border-t border-base-300 bg-base-300/30 shrink-0">
          <div className="flex gap-2 items-center">
            <textarea
              className="textarea textarea-bordered w-full resize-none h-12 min-h-[1rem] rounded-xl bg-base-100 border border-base-300 focus:border-primary transition-[border-color,box-shadow] duration-200 ease-out focus:outline-none"
              placeholder="Type your message here"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            ></textarea>
            <button
              className="btn btn-primary btn-square"
              title="Send message"
              aria-label="Send message"
              onClick={handleSend}
              disabled={isLoading}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </>
    ) : (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
        {history.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-base-content/40 gap-2 mt-20">
            <p className="font-semibold">No changes yet</p>
            <p className="text-xs">Changes you make will appear here</p>
          </div>
        ) : (
          history.map((entry) => (
            <div
              key={entry.id}
              className="bg-base-100 rounded-xl p-3 border border-base-300 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-xs font-bold uppercase tracking-wider ${
                    entry.type === 'edit'
                      ? 'text-primary'
                      : entry.type === 'accept'
                        ? 'text-success'
                        : entry.type === 'skip'
                          ? 'text-warning'
                          : entry.type === 'undo'
                            ? 'text-error'
                            : 'text-info'
                  }`}
                >
                  {entry.type}
                </span>
                <span className="text-xs text-base-content/40">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </span>
              </div>
              <p className="text-sm text-base-content">{entry.description}</p>
            </div>
          ))
        )}
      </div>
    );

  const showFab = isFloating && !isOpen;

  return (
    <>
      <style>{`
        @keyframes assistant-genie-out {
          0%   { transform: scale(1);    opacity: 1; }
          60%  { opacity: 0.85; }
          100% { transform: scale(0.05); opacity: 0; }
        }
        @keyframes assistant-genie-in {
          0%   { transform: scale(0.05); opacity: 0; }
          40%  { opacity: 0.9; }
          100% { transform: scale(1);    opacity: 1; }
        }
        @keyframes assistant-fab-pop {
          0%   { transform: scale(0.6); }
          55%  { transform: scale(1.18); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Error toast (visible even when the panel is collapsed) */}
      {chatError && (
        <div
          role="alert"
          className={`fixed right-6 z-[60] w-72 animate-in fade-in slide-in-from-bottom-5 duration-300 ${
            showFab ? 'bottom-24' : 'bottom-6'
          }`}
        >
          <div className="alert alert-error p-3 text-sm rounded-xl flex items-start gap-2 shadow-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mt-0.5 h-4 w-4 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="flex-1">{chatError}</span>
            <button
              onClick={() => setChatError(null)}
              className="btn btn-ghost btn-xs btn-circle -mr-1 -mt-1 hover:bg-error-content/20"
              title="Dismiss"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ---------- Floating + collapsed: round button ---------- */}
      {showFab && (
        <div
          className="fixed bottom-6 right-6 z-50"
          style={
            fabPop
              ? { animation: 'assistant-fab-pop 320ms cubic-bezier(0.34, 1.56, 0.64, 1)' }
              : undefined
          }
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget) setFabPop(false);
          }}
        >
          <div className="indicator">
            {unresolvedSlideCount > 0 && (
              <span className="indicator-item badge badge-error badge-sm w-3.5 h-3.5 p-0 border-2 border-base-100 rounded-full shadow-sm mt-1 mr-1"></span>
            )}
            <button
              onClick={openFromFab}
              className="btn btn-primary btn-circle btn-lg shadow-md"
              title="Open AI Assistant"
              aria-label="Open AI Assistant"
            >
              <Bot className="w-9 h-9" />
            </button>
          </div>
        </div>
      )}

      {/* ---------- Floating + expanded: movable window ---------- */}
      {isFloating && isOpen && (
        <div
          role="dialog"
          aria-label="AI Assistant"
          style={floatStyle}
          onAnimationEnd={handleFloatAnimationEnd}
          className={`
            fixed z-50 flex flex-col overflow-hidden bg-base-200 border border-base-300 shadow-2xl
            max-md:inset-0 max-md:rounded-none
            md:rounded-xl md:left-[var(--fx)] md:top-[var(--fy)] md:w-[var(--fw)] md:h-[var(--fh)]
            ${isInteracting ? 'select-none' : ''}
            ${floatAnim === 'out' ? 'pointer-events-none' : ''}
          `}
        >
          {/* Header: drag handle */}
          <div className="flex flex-col border-b border-base-300 bg-base-200/50 shrink-0">
            <div
              {...dragProps}
              onDoubleClick={resetFloating}
              title="Drag to move · double-click to reset position"
              className="flex items-center justify-between p-4 pb-2 md:cursor-grab md:active:cursor-grabbing touch-none"
            >
              <div className="flex items-center gap-2 min-w-0 pointer-events-none">
                <Bot className="w-7 h-7 text-primary shrink-0" />
                <h2 className="font-semibold text-lg truncate">AI Assistant</h2>
              </div>
              <div className="flex items-center gap-1">
                {onDockModeChange && (
                  <button
                    onPointerDown={stopDrag}
                    onClick={() => onDockModeChange('docked')}
                    className="btn btn-ghost btn-sm btn-circle"
                    title="Dock to side"
                    aria-label="Dock to side"
                  >
                    <PanelRight className="w-5 h-5" />
                  </button>
                )}
                <button
                  onPointerDown={stopDrag}
                  onClick={minimizeFloating}
                  className="btn btn-ghost btn-sm btn-circle"
                  title="Minimize"
                  aria-label="Minimize"
                >
                  <Minus className="w-5 h-5" />
                </button>
              </div>
            </div>
            {tabsBar}
          </div>

          {tabContent}

          {/* Resize handles (desktop only) */}
          {RESIZE_HANDLES.map(({ direction, className }) => (
            <div
              key={direction}
              {...resizeProps(direction)}
              className={`max-md:hidden absolute z-30 touch-none ${className}`}
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* ---------- Docked + collapsed: rail ---------- */}
      {!isFloating && !isOpen && (
        <aside
          aria-label="AI Assistant (collapsed)"
          className="shrink-0 w-12 h-full flex flex-col items-center gap-2 py-3 border-l border-base-300 bg-base-200"
        >
          <button
            onClick={onToggle}
            className="btn btn-ghost btn-sm btn-square"
            title="Open AI Assistant"
            aria-label="Open AI Assistant"
          >
            <PanelRightOpen className="w-5 h-5" />
          </button>

          <div className="divider my-0" />

          <button
            onClick={() => openTab('chat')}
            className="btn btn-ghost btn-sm btn-square"
            title="Chat"
            aria-label="Open chat"
          >
            <MessageSquare className="w-5 h-5" />
          </button>

          <div className="indicator">
            {unresolvedSlideCount > 0 && (
              <span className="indicator-item badge badge-error badge-xs text-white">
                {unresolvedSlideCount}
              </span>
            )}
            <button
              onClick={() => openTab('review')}
              className="btn btn-ghost btn-sm btn-square"
              title={`Review (${unresolvedSlideCount} open)`}
              aria-label={`Open review, ${unresolvedSlideCount} open`}
            >
              <ListChecks className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={() => openTab('history')}
            className="btn btn-ghost btn-sm btn-square"
            title="History"
            aria-label="Open history"
          >
            <HistoryIcon className="w-5 h-5" />
          </button>
        </aside>
      )}

      {/* ---------- Docked + expanded: side panel ---------- */}
      {!isFloating && isOpen && (
        <aside
          aria-label="AI Assistant"
          style={{ ['--panel-w' as string]: `${width}px` }}
          className={`
            relative shrink-0 h-full flex flex-col bg-base-200 border-l border-base-300
            max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-50 max-md:w-full max-md:shadow-2xl
            md:w-[var(--panel-w)]
            ${isDragging ? '' : 'md:transition-[width] md:duration-150'}
          `}
        >
          {/* Resize handle (desktop only) */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize AI Assistant panel"
            aria-valuenow={width}
            aria-valuemin={MIN_WIDTH}
            aria-valuemax={MAX_WIDTH}
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleResizeKeyDown}
            onDoubleClick={resetWidth}
            title="Drag to resize · double-click to reset"
            className={`
              max-md:hidden absolute inset-y-0 -left-1 w-2 z-10 cursor-col-resize touch-none
              transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none
              ${isDragging ? 'bg-primary/40' : ''}
            `}
          />

          {/* Header */}
          <div className="flex flex-col border-b border-base-300 bg-base-200/50 shrink-0">
            <div className="flex items-center justify-between p-4 pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Bot className="w-7 h-7 text-primary shrink-0" />
                <h2 className="font-semibold text-lg truncate">AI Assistant</h2>
              </div>
              <div className="flex items-center gap-1">
                {onDockModeChange && (
                  <button
                    onClick={() => onDockModeChange('floating')}
                    className="btn btn-ghost btn-sm btn-circle max-md:hidden"
                    title="Pop out as floating window"
                    aria-label="Pop out as floating window"
                  >
                    <PictureInPicture2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={onToggle}
                  className="btn btn-ghost btn-sm btn-circle"
                  title="Collapse panel"
                  aria-label="Collapse panel"
                >
                  <PanelRightClose className="w-5 h-5" />
                </button>
              </div>
            </div>
            {tabsBar}
          </div>

          {tabContent}
        </aside>
      )}
    </>
  );
}

export default ChatPanel;
