import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTableEditor } from './useTableEditor';
import type { ExtractedPage } from '../models/TableData';
// This test file was generated with the assistance of Google Gemini.
function createMockPage(): ExtractedPage {
  return {
    pageIndex: 0,
    columns: ['ITEM', 'QTY', 'PRICE'],
    itemColumnKey: 'ITEM',
    rows: [
      {
        _id: 'r1',
        _indentLevel: 0,
        _confidence: 0.9,
        _cellConfidence: { ITEM: 0.9, QTY: 0.95, PRICE: 0.85 },
        _cellKeyMap: {},
        ITEM: 'Widget A',
        QTY: '2',
        PRICE: '10.00',
      },
      {
        _id: 'r2',
        _indentLevel: 0,
        _confidence: 0.9,
        _cellConfidence: { ITEM: 0.9, QTY: 0.9, PRICE: 0.9 },
        _cellKeyMap: {},
        ITEM: 'Widget B',
        QTY: '5',
        PRICE: '25.00',
      },
    ],
  };
}

describe('useTableEditor', () => {
  let initialPages: ExtractedPage[];
  let pagesRef: { current: ExtractedPage[] };
  let pageIndexRef: { current: number };
  let onPagesChange: ReturnType<typeof vi.fn>;
  let onPersist: ReturnType<typeof vi.fn>;
  let addHistoryEntry: ReturnType<typeof vi.fn>;
  let pushUndo: ReturnType<typeof vi.fn>;
  let onCellEdited: ReturnType<typeof vi.fn>;
  let onColumnRenamed: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    initialPages = [createMockPage()];
    pagesRef = { current: initialPages };
    pageIndexRef = { current: 0 };
    onPagesChange = vi.fn((updater) => {
      pagesRef.current = updater(pagesRef.current);
    });
    onPersist = vi.fn();
    addHistoryEntry = vi.fn();
    pushUndo = vi.fn();
    onCellEdited = vi.fn();
    onColumnRenamed = vi.fn();
  });

  function setupHook() {
    return renderHook(() =>
      useTableEditor({
        currentPageIndexRef: pageIndexRef,
        extractedPagesRef: pagesRef,
        onPagesChange,
        onPersist,
        addHistoryEntry,
        pushUndo,
        onCellEdited,
        onColumnRenamed,
      })
    );
  }

  describe('editCell', () => {
    it('edits a cell value, snapshots undo, adds history entry, and notifies listeners', () => {
      const { result } = setupHook();

      act(() => {
        result.current.editCell('r1:PRICE', '15.00');
      });

      expect(pushUndo).toHaveBeenCalledWith(initialPages);
      expect(onPersist).toHaveBeenCalledTimes(1);
      const updatedPage = onPersist.mock.calls[0][0][0];
      expect(updatedPage.rows[0].PRICE).toBe('15.00');

      expect(addHistoryEntry).toHaveBeenCalledWith({
        type: 'edit',
        pageIndex: 0,
        fieldId: 'r1:PRICE',
        column: 'PRICE',
        oldValue: '10.00',
        newValue: '15.00',
        description: 'Edited "PRICE" on page 1: "10.00" to "15.00"',
      });

      expect(onCellEdited).toHaveBeenCalledWith('r1:PRICE');
    });

    it('does nothing when rowId does not exist in table', () => {
      const { result } = setupHook();

      act(() => {
        result.current.editCell('unknown_row:PRICE', '10.00');
      });

      expect(pushUndo).not.toHaveBeenCalled();
      expect(onPersist).not.toHaveBeenCalled();
      expect(addHistoryEntry).not.toHaveBeenCalled();
      expect(onCellEdited).not.toHaveBeenCalled();
    });
  });

  describe('addRow and deleteRow', () => {
    it('addRow appends a new row to the table', () => {
      const { result } = setupHook();

      act(() => {
        result.current.addRow();
      });

      expect(pushUndo).toHaveBeenCalledWith(initialPages);
      expect(onPersist).toHaveBeenCalledTimes(1);
      const updatedPages = onPersist.mock.calls[0][0];
      expect(updatedPages[0].rows).toHaveLength(3);
    });

    it('deleteRow removes the target row by id', () => {
      const { result } = setupHook();

      act(() => {
        result.current.deleteRow('r1');
      });

      expect(pushUndo).toHaveBeenCalledWith(initialPages);
      expect(onPersist).toHaveBeenCalledTimes(1);
      const updatedPages = onPersist.mock.calls[0][0];
      expect(updatedPages[0].rows).toHaveLength(1);
      expect(updatedPages[0].rows[0]._id).toBe('r2');
    });
  });

  describe('addColumn, deleteColumn, and renameColumn', () => {
    it('addColumn adds a new column to the grid', () => {
      const { result } = setupHook();

      act(() => {
        result.current.addColumn('TAX');
      });

      expect(pushUndo).toHaveBeenCalledWith(initialPages);
      expect(onPersist).toHaveBeenCalledTimes(1);
      const updatedPages = onPersist.mock.calls[0][0];
      expect(updatedPages[0].columns).toContain('TAX');
    });

    it('deleteColumn removes a column and its cell values', () => {
      const { result } = setupHook();

      act(() => {
        result.current.deleteColumn('PRICE');
      });

      expect(pushUndo).toHaveBeenCalledWith(initialPages);
      expect(onPersist).toHaveBeenCalledTimes(1);
      const updatedPages = onPersist.mock.calls[0][0];
      expect(updatedPages[0].columns).not.toContain('PRICE');
      expect(updatedPages[0].rows[0].PRICE).toBeUndefined();
    });

    it('renameColumn renames a column, adds history entry, and calls onColumnRenamed', () => {
      const { result } = setupHook();

      act(() => {
        result.current.renameColumn('QTY', 'QUANTITY');
      });

      expect(pushUndo).toHaveBeenCalledWith(initialPages);
      expect(onPersist).toHaveBeenCalledTimes(1);
      const updatedPages = onPersist.mock.calls[0][0];
      expect(updatedPages[0].columns).toContain('QUANTITY');
      expect(updatedPages[0].columns).not.toContain('QTY');

      expect(addHistoryEntry).toHaveBeenCalledWith({
        type: 'edit',
        pageIndex: 0,
        column: 'QUANTITY',
        oldValue: 'QTY',
        newValue: 'QUANTITY',
        description: 'Renamed column "QTY" to "QUANTITY" on page 1',
      });

      expect(onColumnRenamed).toHaveBeenCalledWith('QTY', 'QUANTITY');
    });
  });

  describe('setIndentColumn', () => {
    it('updates itemColumnKey and logs history entry', () => {
      const { result } = setupHook();

      act(() => {
        result.current.setIndentColumn('QTY');
      });

      expect(pushUndo).toHaveBeenCalledWith(initialPages);
      expect(onPersist).toHaveBeenCalledTimes(1);
      const updatedPages = onPersist.mock.calls[0][0];
      expect(updatedPages[0].itemColumnKey).toBe('QTY');

      expect(addHistoryEntry).toHaveBeenCalledWith({
        type: 'edit',
        pageIndex: 0,
        column: 'QTY',
        oldValue: 'ITEM',
        newValue: 'QTY',
        description: 'Changed indent column from "ITEM" to "QTY" on page 1',
      });
    });
  });

  describe('moveRow and reorderColumns', () => {
    it('moveRow swaps row positions', () => {
      const { result } = setupHook();

      act(() => {
        result.current.moveRow('r1', 'down');
      });

      expect(pushUndo).toHaveBeenCalledWith(initialPages);
      expect(onPersist).toHaveBeenCalledTimes(1);
      const updatedPages = onPersist.mock.calls[0][0];
      expect(updatedPages[0].rows[0]._id).toBe('r2');
      expect(updatedPages[0].rows[1]._id).toBe('r1');
    });

    it('reorderColumns sets new column order', () => {
      const { result } = setupHook();

      act(() => {
        result.current.reorderColumns(['PRICE', 'QTY', 'ITEM']);
      });

      expect(pushUndo).toHaveBeenCalledWith(initialPages);
      expect(onPersist).toHaveBeenCalledTimes(1);
      const updatedPages = onPersist.mock.calls[0][0];
      expect(updatedPages[0].columns).toEqual(['PRICE', 'QTY', 'ITEM']);
    });
  });

  describe('edge cases', () => {
    it('gracefully handles missing page at currentPageIndexRef', () => {
      pageIndexRef.current = 999;
      const { result } = setupHook();

      act(() => {
        result.current.editCell('r1_PRICE', '99.00');
        result.current.addRow();
      });

      expect(pushUndo).not.toHaveBeenCalled();
      expect(onPersist).not.toHaveBeenCalled();
      expect(addHistoryEntry).not.toHaveBeenCalled();
    });
  });
});
