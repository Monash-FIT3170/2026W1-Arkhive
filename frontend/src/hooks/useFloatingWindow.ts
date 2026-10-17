import { useCallback, useEffect, useRef, useState } from 'react';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Claude was used to make this Hook

interface Options {
  /** localStorage key used to remember position + size between sessions. */
  storageKey: string;
  defaultSize: { width: number; height: number };
  minSize: { width: number; height: number };
  /** Gap from the viewport's bottom-right corner for the default position. */
  margin?: number;
}

type InteractionMode = 'drag' | ResizeDirection;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Drag + resize behaviour for a `position: fixed` window, in the same spirit
 * as DocumentPreviewPiP (header drag, 8 resize handles) but built on pointer
 * events so it also works with touch and pen, and clamped to the viewport.
 *
 * Usage:
 *   const { rect, isInteracting, dragProps, resizeProps, reset } = useFloatingWindow({...});
 *   <div style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
 *     <header {...dragProps} />
 *     <div {...resizeProps('se')} />
 *   </div>
 */
export function useFloatingWindow({ storageKey, defaultSize, minSize, margin = 24 }: Options) {
  const { width: minW, height: minH } = minSize;
  const { width: defaultW, height: defaultH } = defaultSize;

  /** Keeps a rect inside the viewport and above the minimum size. */
  const fit = useCallback(
    (r: FloatingRect): FloatingRect => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(Math.max(r.width, minW), vw);
      const height = Math.min(Math.max(r.height, minH), vh);
      return {
        width,
        height,
        x: clamp(r.x, 0, vw - width),
        y: clamp(r.y, 0, vh - height),
      };
    },
    [minW, minH]
  );

  const defaultRect = useCallback(
    (): FloatingRect =>
      fit({
        width: defaultW,
        height: defaultH,
        x: window.innerWidth - defaultW - margin,
        y: window.innerHeight - defaultH - margin,
      }),
    [fit, defaultW, defaultH, margin]
  );

  const [rect, setRectState] = useState<FloatingRect>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<FloatingRect>;
        if (
          typeof parsed.x === 'number' &&
          typeof parsed.y === 'number' &&
          typeof parsed.width === 'number' &&
          typeof parsed.height === 'number'
        ) {
          return fit(parsed as FloatingRect);
        }
      }
    } catch {
      /* ignore: fall back to the default position */
    }
    return defaultRect();
  });

  const rectRef = useRef(rect);
  const setRect = useCallback((next: FloatingRect) => {
    rectRef.current = next;
    setRectState(next);
  }, []);

  const [isInteracting, setInteracting] = useState(false);
  const startRef = useRef<{
    mode: InteractionMode;
    pointerX: number;
    pointerY: number;
    rect: FloatingRect;
  } | null>(null);

  const persist = useCallback(
    (r: FloatingRect) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(r));
      } catch {
        /* storage unavailable: position just won't persist */
      }
    },
    [storageKey]
  );

  const begin = useCallback((mode: InteractionMode, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    startRef.current = {
      mode,
      pointerX: e.clientX,
      pointerY: e.clientY,
      rect: rectRef.current,
    };

    setInteracting(true);
  }, []);

  const move = (e: React.PointerEvent<HTMLElement>) => {
    const start = startRef.current;
    if (!start) return;

    const dx = e.clientX - start.pointerX;
    const dy = e.clientY - start.pointerY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { x: sx, y: sy, width: sw, height: sh } = start.rect;

    if (start.mode === 'drag') {
      setRect({
        x: clamp(sx + dx, 0, vw - sw),
        y: clamp(sy + dy, 0, vh - sh),
        width: sw,
        height: sh,
      });
      return;
    }

    let x = sx;
    let y = sy;
    let width = sw;
    let height = sh;

    if (start.mode.includes('e')) {
      width = clamp(sw + dx, minW, vw - sx);
    } else if (start.mode.includes('w')) {
      x = clamp(sx + dx, 0, sx + sw - minW);
      width = sx + sw - x;
    }

    if (start.mode.includes('s')) {
      height = clamp(sh + dy, minH, vh - sy);
    } else if (start.mode.includes('n')) {
      y = clamp(sy + dy, 0, sy + sh - minH);
      height = sy + sh - y;
    }

    setRect({ x, y, width, height });
  };

  const end = (e: React.PointerEvent<HTMLElement>) => {
    if (!startRef.current) return;
    startRef.current = null;
    setInteracting(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    persist(rectRef.current);
  };

  // Keep the window reachable when the browser window shrinks.
  useEffect(() => {
    const onResize = () => setRect(fit(rectRef.current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [fit, setRect]);

  /** Back to the default bottom-right position and size. */
  const reset = useCallback(() => {
    const next = defaultRect();
    setRect(next);
    persist(next);
  }, [defaultRect, persist, setRect]);

  const shared = { onPointerMove: move, onPointerUp: end, onPointerCancel: end };

  return {
    rect,
    isInteracting,
    reset,
    /** Spread onto the element that should move the window (the header). */
    dragProps: {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => begin('drag', e),
      ...shared,
    },
    /** Spread onto an edge/corner element: `{...resizeProps('se')}`. */
    resizeProps: (direction: ResizeDirection) => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => begin(direction, e),
      ...shared,
    }),
  };
}
