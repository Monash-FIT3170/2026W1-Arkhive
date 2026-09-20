import { useCallback, useEffect, useRef, type RefObject } from 'react';

interface UseUndoRedoOptions<T> {
  // Applies a restored snapshot back into your component's state. `direction`
  // lets the caller log history/analytics differently for undo vs redo
  // without needing its own keydown listener.
  onApply: (value: T, direction: 'undo' | 'redo') => void;
  // Set false if the consumer wants to wire up its own key bindings
  // (e.g. to scope them to when a modal/panel is focused).
  enableKeyboardShortcuts?: boolean;
}

// Generalizes ValidationPage's undo/redo stack (previously duplicated as two
// near-identical refs + two near-identical callbacks + a keydown listener).
// `currentRef` should always point at the latest value of the state being
// tracked (a ref, not state, so undo/redo callbacks don't need to be
// re-created every render).
export function useUndoRedo<T>(
  currentRef: RefObject<T>,
  { onApply, enableKeyboardShortcuts = true }: UseUndoRedoOptions<T>
) {
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);

  // Call before applying a new change, passing the pre-change snapshot.
  const push = useCallback((snapshot: T) => {
    undoStack.current.push(snapshot);
    redoStack.current = [];
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return false;
    const previous = undoStack.current.pop()!;
    redoStack.current.push(currentRef.current);
    onApply(previous, 'undo');
    return true;
  }, [onApply, currentRef]);

  const redo = useCallback(() => {
    if (redoStack.current.length === 0) return false;
    const next = redoStack.current.pop()!;
    undoStack.current.push(currentRef.current);
    onApply(next, 'redo');
    return true;
  }, [onApply, currentRef]);

  useEffect(() => {
    if (!enableKeyboardShortcuts) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const hasModifier = e.metaKey || e.ctrlKey;
      const isUndo = hasModifier && key === 'z' && !e.shiftKey;
      const isRedo = hasModifier && (key === 'y' || (key === 'z' && e.shiftKey));
      if (isUndo) {
        e.preventDefault();
        undo();
      } else if (isRedo) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, enableKeyboardShortcuts]);

  return { push, undo, redo, undoStack, redoStack };
}
