import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUndoRedo } from './useUndoRedo';

describe('useUndoRedo', () => {
  let currentRef: { current: string };
  let onApply: Mock<(val: string, direction: 'undo' | 'redo') => void>;

  beforeEach(() => {
    currentRef = { current: 'state-0' };
    onApply = vi.fn((val) => {
      currentRef.current = val;
    });
  });

  it('push adds snapshot to undo stack and clears redo stack', () => {
    const { result } = renderHook(() => useUndoRedo(currentRef, { onApply }));

    act(() => {
      result.current.push('state-0');
    });

    expect(result.current.undoStack.current).toEqual(['state-0']);
    expect(result.current.redoStack.current).toEqual([]);

    // Simulate an undo putting something on redoStack
    act(() => {
      currentRef.current = 'state-1';
      result.current.undo();
    });
    expect(result.current.redoStack.current).toEqual(['state-1']);

    // New push must clear redoStack
    act(() => {
      result.current.push('state-1-diverged');
    });
    expect(result.current.redoStack.current).toEqual([]);
  });

  it('undo returns false when stack is empty and does not call onApply', () => {
    const { result } = renderHook(() => useUndoRedo(currentRef, { onApply }));

    let success: boolean | undefined;
    act(() => {
      success = result.current.undo();
    });

    expect(success).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('undo pops snapshot, records current in redo stack, and calls onApply with "undo"', () => {
    const { result } = renderHook(() => useUndoRedo(currentRef, { onApply }));

    act(() => {
      result.current.push('state-0');
      currentRef.current = 'state-1';
    });

    let success: boolean | undefined;
    act(() => {
      success = result.current.undo();
    });

    expect(success).toBe(true);
    expect(onApply).toHaveBeenCalledWith('state-0', 'undo');
    expect(result.current.undoStack.current).toEqual([]);
    expect(result.current.redoStack.current).toEqual(['state-1']);
  });

  it('redo returns false when redo stack is empty and does not call onApply', () => {
    const { result } = renderHook(() => useUndoRedo(currentRef, { onApply }));

    let success: boolean | undefined;
    act(() => {
      success = result.current.redo();
    });

    expect(success).toBe(false);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('redo restores next snapshot and calls onApply with "redo"', () => {
    const { result } = renderHook(() => useUndoRedo(currentRef, { onApply }));

    act(() => {
      result.current.push('state-0');
      currentRef.current = 'state-1';
      result.current.undo();
    });

    expect(onApply).toHaveBeenCalledWith('state-0', 'undo');

    let success: boolean | undefined;
    act(() => {
      success = result.current.redo();
    });

    expect(success).toBe(true);
    expect(onApply).toHaveBeenCalledWith('state-1', 'redo');
    expect(result.current.undoStack.current).toEqual(['state-0']);
    expect(result.current.redoStack.current).toEqual([]);
  });

  it('supports multiple sequential undo and redo operations', () => {
    const { result } = renderHook(() => useUndoRedo(currentRef, { onApply }));

    // A -> B -> C
    act(() => {
      result.current.push('A');
      currentRef.current = 'B';
      result.current.push('B');
      currentRef.current = 'C';
    });

    // Undo to B
    act(() => {
      result.current.undo();
    });
    expect(currentRef.current).toBe('B');

    // Undo to A
    act(() => {
      result.current.undo();
    });
    expect(currentRef.current).toBe('A');

    // Redo to B
    act(() => {
      result.current.redo();
    });
    expect(currentRef.current).toBe('B');

    // Redo to C
    act(() => {
      result.current.redo();
    });
    expect(currentRef.current).toBe('C');
  });

  it('handles Ctrl+Z / Cmd+Z for undo via window keydown listener', () => {
    renderHook(() => useUndoRedo(currentRef, { onApply, enableKeyboardShortcuts: true }));

    act(() => {
      currentRef.current = 'modified';
    });

    const event = new KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      cancelable: true,
    });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

    act(() => {
      window.dispatchEvent(event);
    });

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('handles Ctrl+Y and Shift+Cmd+Z for redo via window keydown listener', () => {
    renderHook(() => useUndoRedo(currentRef, { onApply, enableKeyboardShortcuts: true }));

    const eventY = new KeyboardEvent('keydown', {
      key: 'y',
      ctrlKey: true,
      cancelable: true,
    });
    const preventDefaultSpyY = vi.spyOn(eventY, 'preventDefault');

    act(() => {
      window.dispatchEvent(eventY);
    });
    expect(preventDefaultSpyY).toHaveBeenCalled();

    const eventShiftZ = new KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
      shiftKey: true,
      cancelable: true,
    });
    const preventDefaultSpyShiftZ = vi.spyOn(eventShiftZ, 'preventDefault');

    act(() => {
      window.dispatchEvent(eventShiftZ);
    });
    expect(preventDefaultSpyShiftZ).toHaveBeenCalled();
  });

  it('does not attach keydown listener when enableKeyboardShortcuts is false', () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useUndoRedo(currentRef, { onApply, enableKeyboardShortcuts: false }));

    expect(addListenerSpy).not.toHaveBeenCalled();
    addListenerSpy.mockRestore();
  });
});
