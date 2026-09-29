import { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, GripHorizontal } from 'lucide-react';
import DocumentPanel from './DocumentPanel';
import type { OCRComponent } from '../../../../models/OCRComponent';

export interface DocumentPreviewPiPProps {
  documentImageUrl?: string | null;
  ocrData: OCRComponent[];
  currentPageIndex: number;
  hoveredOverlayIds: string[];
  onClose: () => void;
  containerRef?: React.RefObject<HTMLElement | null>;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 224;

export default function DocumentPreviewPiP({
  documentImageUrl,
  ocrData,
  currentPageIndex,
  hoveredOverlayIds,
  onClose,
  containerRef,
}: DocumentPreviewPiPProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Position: null indicates initial CSS-based position (bottom-4 left-4)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  });

  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    width: number;
    height: number;
    posX: number;
    posY: number;
    direction: ResizeDirection;
  }>({
    mouseX: 0,
    mouseY: 0,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    posX: 0,
    posY: 0,
    direction: 'se',
  });

  // Calculate current top-left relative to parent container
  const getContainerOffset = useCallback(() => {
    const fallbackWidth = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1200;
    const fallbackHeight = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 800;

    if (!modalRef.current) {
      return { x: 16, y: 16, containerWidth: fallbackWidth, containerHeight: fallbackHeight };
    }

    const modalRect = modalRef.current.getBoundingClientRect();
    const container = containerRef?.current ?? modalRef.current.parentElement;
    const containerRect = container?.getBoundingClientRect();

    const containerWidth = containerRect && containerRect.width > 0 ? containerRect.width : fallbackWidth;
    const containerHeight = containerRect && containerRect.height > 0 ? containerRect.height : fallbackHeight;

    return {
      x: modalRect.left - (containerRect?.left ?? 0),
      y: modalRect.top - (containerRect?.top ?? 0),
      containerWidth,
      containerHeight,
    };
  }, [containerRef]);

  // ── Dragging Handler (Header) ──────────────────────────────────────────────
  const handleDragMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only primary mouse button
      if (e.button !== 0) return;
      e.preventDefault();

      const offset = getContainerOffset();
      const currentX = position ? position.x : offset.x;
      const currentY = position ? position.y : offset.y;

      if (!position) {
        setPosition({ x: currentX, y: currentY });
      }

      isDraggingRef.current = true;
      dragStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        posX: currentX,
        posY: currentY,
      };

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
    },
    [getContainerOffset, position]
  );

  // ── Resizing Handler ───────────────────────────────────────────────────────
  const handleResizeMouseDown = useCallback(
    (direction: ResizeDirection, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const offset = getContainerOffset();
      const currentX = position ? position.x : offset.x;
      const currentY = position ? position.y : offset.y;

      if (!position) {
        setPosition({ x: currentX, y: currentY });
      }

      isResizingRef.current = true;
      resizeStartRef.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        width: size.width,
        height: size.height,
        posX: currentX,
        posY: currentY,
        direction,
      };

      document.body.style.userSelect = 'none';
      const cursorMap: Record<ResizeDirection, string> = {
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
        ne: 'nesw-resize',
        nw: 'nwse-resize',
        se: 'nwse-resize',
        sw: 'nesw-resize',
      };
      document.body.style.cursor = cursorMap[direction] || 'nwse-resize';
    },
    [getContainerOffset, position, size]
  );

  // ── Global Mouse Move & Mouse Up Listeners ─────────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        const { mouseX, mouseY, posX, posY } = dragStartRef.current;
        const dx = e.clientX - mouseX;
        const dy = e.clientY - mouseY;

        const offset = getContainerOffset();
        const maxX = Math.max(0, offset.containerWidth - size.width);
        const maxY = Math.max(0, offset.containerHeight - size.height);

        const nextX = Math.min(maxX, Math.max(0, posX + dx));
        const nextY = Math.min(maxY, Math.max(0, posY + dy));

        setPosition({ x: nextX, y: nextY });
      } else if (isResizingRef.current) {
        const { mouseX, mouseY, width, height, posX, posY, direction } = resizeStartRef.current;
        const dx = e.clientX - mouseX;
        const dy = e.clientY - mouseY;
        const offset = getContainerOffset();

        let newWidth = width;
        let newHeight = height;
        let newX = posX;
        let newY = posY;

        // East / West width calculation
        if (direction.includes('e')) {
          const maxWidth = Math.max(MIN_WIDTH, offset.containerWidth - posX);
          newWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, width + dx));
        } else if (direction.includes('w')) {
          const maxExpandLeft = posX + width - MIN_WIDTH;
          const clampedDx = Math.max(-posX, Math.min(maxExpandLeft, dx));
          newWidth = width - clampedDx;
          newX = posX + clampedDx;
        }

        // North / South height calculation
        if (direction.includes('s')) {
          const maxHeight = Math.max(MIN_HEIGHT, offset.containerHeight - posY);
          newHeight = Math.min(maxHeight, Math.max(MIN_HEIGHT, height + dy));
        } else if (direction.includes('n')) {
          const maxExpandUp = posY + height - MIN_HEIGHT;
          const clampedDy = Math.max(-posY, Math.min(maxExpandUp, dy));
          newHeight = height - clampedDy;
          newY = posY + clampedDy;
        }

        setSize({ width: newWidth, height: newHeight });
        setPosition({ x: newX, y: newY });
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRef.current || isResizingRef.current) {
        isDraggingRef.current = false;
        isResizingRef.current = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [getContainerOffset, size.width, size.height]);

  const style: React.CSSProperties = position
    ? {
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
      }
    : {
        position: 'absolute',
        bottom: '1rem',
        left: '1rem',
        width: `${size.width}px`,
        height: `${size.height}px`,
      };

  return (
    <div
      ref={modalRef}
      style={style}
      className="z-20 bg-base-100/95 border border-base-300 rounded-xl shadow-2xl overflow-hidden flex flex-col backdrop-blur-md select-none group/pip"
      data-testid="pip-document-preview-modal"
    >
      {/* ── PiP Header Bar (Draggable) ── */}
      <div
        onMouseDown={handleDragMouseDown}
        className="bg-base-200 px-3 py-1.5 border-b border-base-300 flex items-center justify-between text-xs font-semibold text-base-content/80 cursor-grab active:cursor-grabbing select-none"
        title="Click and drag to move preview"
      >
        <span className="flex items-center gap-1.5 pointer-events-none">
          <GripHorizontal className="w-3.5 h-3.5 text-base-content/40 group-hover/pip:text-base-content/70 transition-colors" />
          <FileText className="w-3.5 h-3.5 text-primary" />
          <span>Document Preview</span>
        </span>
        <div className="flex items-center gap-1">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onClose}
            className="btn btn-ghost btn-xs btn-circle h-5 w-5 min-h-0 cursor-pointer"
            title="Hide preview"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Document Preview Content ── */}
      <div className="flex-1 relative overflow-hidden bg-base-300/30">
        <DocumentPanel
          hoveredOverlayIds={hoveredOverlayIds}
          documentImageUrl={documentImageUrl ?? undefined}
          ocrData={ocrData}
          currentPageIndex={currentPageIndex}
          hideThumbnails={true}
          compactMode={true}
        />
      </div>

      {/* ── Resize Handles (8 Directions) ── */}
      {/* Corners */}
      <div
        onMouseDown={(e) => handleResizeMouseDown('nw', e)}
        className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-30"
        title="Resize"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown('ne', e)}
        className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-30"
        title="Resize"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown('sw', e)}
        className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-30"
        title="Resize"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown('se', e)}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-30"
        title="Resize"
      />

      {/* Edges */}
      <div
        onMouseDown={(e) => handleResizeMouseDown('n', e)}
        className="absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize z-30"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown('s', e)}
        className="absolute bottom-0 left-3 right-3 h-1.5 cursor-ns-resize z-30"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown('w', e)}
        className="absolute top-3 bottom-3 left-0 w-1.5 cursor-ew-resize z-30"
      />
      <div
        onMouseDown={(e) => handleResizeMouseDown('e', e)}
        className="absolute top-3 bottom-3 right-0 w-1.5 cursor-ew-resize z-30"
      />

      {/* Corner Resize Grip Visual Indicator (Bottom-Right) */}
      <div className="absolute bottom-1 right-1 pointer-events-none text-base-content/30 group-hover/pip:text-base-content/60 transition-colors z-20">
        <svg className="w-2.5 h-2.5" viewBox="0 0 6 6" fill="currentColor">
          <circle cx="5" cy="5" r="0.75" />
          <circle cx="5" cy="3" r="0.75" />
          <circle cx="3" cy="5" r="0.75" />
          <circle cx="5" cy="1" r="0.75" />
          <circle cx="3" cy="3" r="0.75" />
          <circle cx="1" cy="5" r="0.75" />
        </svg>
      </div>
    </div>
  );
}
