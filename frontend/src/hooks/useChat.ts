import { useCallback, useState, type RefObject } from 'react';
import type { ChatMessage } from '../models/Message';
import type { ExtractedPage } from '../models/TableData';

interface UseChatSuggestionFlowOptions {
  currentPageIndex: number;
  documentContext: ExtractedPage | null;
  extractedPagesRef: RefObject<ExtractedPage[]>;
  onPagesChange: (updater: (pages: ExtractedPage[]) => ExtractedPage[]) => void;
  onPersist: (pages: ExtractedPage[]) => Promise<void> | void;
  pushUndo: (snapshot: ExtractedPage[]) => void;
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

  // called when AI returns updatedContext after accepting a suggestion
  const handleContextUpdate = useCallback(
    (updatedData: ExtractedPage) => {
      pushUndo(extractedPagesRef.current);
      setOldContext(documentContext);
      onPagesChange((prev) => prev.map((page, i) => (i === currentPageIndex ? updatedData : page)));
    },
    [pushUndo, extractedPagesRef, documentContext, onPagesChange, currentPageIndex]
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
