import { useCallback, useState, type RefObject } from 'react';
import type { AppliedEdits, ChatMessage, Intent } from '../models/Message';
import type { ExtractedPage } from '../models/TableData';
import type { HistoryEntry } from '../models/HistoryEntry';
import { switchActiveTable } from '../utils/flattener';

interface UseChatSuggestionFlowOptions {
  currentPageIndex: number;
  documentContext: ExtractedPage | null;
  extractedPagesRef: RefObject<ExtractedPage[]>;
  onPagesChange: (updater: (pages: ExtractedPage[]) => ExtractedPage[]) => void;
  onPersist: (pages: ExtractedPage[]) => Promise<void> | void;
  pushUndo: (snapshot: ExtractedPage[]) => void;
  /** Records the AI edit in the workspace history list. */
  addHistoryEntry: (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => void;
  /** The AI edited these table cells: mark them as edited / resolve their review issues. */
  onCellsEdited?: (cells: AppliedEdits['cells']) => void;
  /** The AI edited these field / text blocks. */
  onBlocksEdited?: (blockIds: string[]) => void;
}

const clip = (s: string | undefined, max = 40) => {
  const t = (s ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

/** " (Table 2)" when the page has several tables, otherwise "". */
function tableSuffix(page: ExtractedPage, tableId?: string): string {
  const order = page.tableOrder ?? [];
  if (!tableId || order.length < 2) return '';
  const i = order.indexOf(tableId);
  return i >= 0 ? ` (Table ${i + 1})` : '';
}

/** One human-readable history line per AI edit. */
function describeAiEdit(
  page: ExtractedPage,
  intent: Intent | null | undefined,
  applied: AppliedEdits | undefined
): string {
  if (!intent) return 'AI edit';
  const where = tableSuffix(page, applied?.tableIds[0]);

  switch (intent.type) {
    case 'correction':
      return `AI edit${where}: ${intent.column} → "${clip(intent.newValue)}"`;
    case 'bulk_update': {
      const cols = [...new Set((applied?.cells ?? []).map((c) => c.column))].join(', ');
      return `AI edit${where}: updated ${applied?.cells.length ?? 0} cell(s) in ${cols}`;
    }
    case 'column_correction':
      return `AI renamed column${where}: ${(intent.updates ?? []).map((u) => `${u.from} → ${u.to}`).join(', ')}`;
    case 'column_delete':
      return `AI deleted column(s)${where}: ${(intent.deletedColumns ?? []).join(', ')}`;
    case 'field_correction': {
      const label =
        page.fields?.find((f) => f.id === intent.blockId)?.label ??
        page.texts?.find((t) => t.id === intent.blockId)?.role ??
        'text';
      return `AI edit: ${label} → "${clip(intent.newValue)}"`;
    }
    default:
      return 'AI edit';
  }
}

// Wraps the propose -> accept/reject cycle used when the AI chat suggests a
// full-page context update: handleContextUpdate stages the change (and lets
// the user undo it like any other edit), handleAccept persists it, and
// handleReject swaps the staged page back to what it was before.
export function useChatSuggestionFlow({
  currentPageIndex,
  documentContext,
  extractedPagesRef,
  onPagesChange,
  onPersist,
  pushUndo,
  addHistoryEntry,
  onCellsEdited,
  onBlocksEdited,
}: UseChatSuggestionFlowOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [oldContext, setOldContext] = useState<ExtractedPage | null>(null);

  const addMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  const resolveLastMessage = useCallback(() => {
    setMessages((prev) =>
      prev.map((msg, i) => (i === prev.length - 1 ? { ...msg, resolved: true } : msg))
    );
  }, []);

  // Called when the AI returns an updatedContext. `applied` says what changed;
  // when the edit landed on a table that isn't on screen we bring it forward so
  // the user can actually see (and judge) the change before accepting.
  const handleContextUpdate = useCallback(
    (updatedData: ExtractedPage, applied?: AppliedEdits, intent?: Intent | null) => {
      pushUndo(extractedPagesRef.current);
      setOldContext(documentContext);

      // Exactly ONE history entry per pushUndo: the workspace's undo pops one
      // history entry per undo snapshot, so the two stacks must stay in step
      // (even for a bulk edit that touches many cells).
      if (documentContext) {
        addHistoryEntry({
          type: 'ai_edit',
          description: describeAiEdit(documentContext, intent, applied),
        });
      }

      const editedTableId = applied?.tableIds[0];
      const staged = editedTableId ? switchActiveTable(updatedData, editedTableId) : updatedData;

      onPagesChange((prev) => prev.map((page, i) => (i === currentPageIndex ? staged : page)));

      if (applied?.cells.length) onCellsEdited?.(applied.cells);
      if (applied?.blockIds.length) onBlocksEdited?.(applied.blockIds);
    },
    [
      pushUndo,
      extractedPagesRef,
      documentContext,
      addHistoryEntry,
      onPagesChange,
      currentPageIndex,
      onCellsEdited,
      onBlocksEdited,
    ]
  );

  const handleAccept = useCallback(async () => {
    if (!documentContext) return;
    try {
      await onPersist(extractedPagesRef.current);
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
  }, [documentContext, onPersist, extractedPagesRef, resolveLastMessage, addMessage]);

  const handleReject = useCallback(() => {
    if (!oldContext) return;
    onPagesChange((prev) => prev.map((page, i) => (i === currentPageIndex ? oldContext : page)));
    setOldContext(null);
    resolveLastMessage();
    addMessage({
      id: crypto.randomUUID(),
      role: 'model',
      content: 'No problem, the changes have been reverted.',
      timestamp: new Date().toISOString(),
    });
  }, [oldContext, onPagesChange, currentPageIndex, resolveLastMessage, addMessage]);

  return {
    messages,
    addMessage,
    oldContext,
    handleContextUpdate,
    handleAccept,
    handleReject,
  };
}
