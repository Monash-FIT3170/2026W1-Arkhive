import { useCallback, useState, type RefObject } from 'react';
import type { ExtractedPage } from '../models/TableData';
import { findTableIdForField, getOverlayIdForField } from '../utils/tableOperations';

// Shallow-equal check for string[]. Lets callers pass a freshly-created array
// each render/call without forcing a state update (and downstream re-render)
// when the actual contents haven't changed.
function sameIds(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

interface UseFieldHoverNavigation {
  // Ref to the currently-displayed page index, read synchronously so
  // handleSlideChange never acts on a stale value.
  currentPageIndexRef: RefObject<number>;
  // Ref to all pages, so slides for a page other than the current one can
  // still resolve overlay ids correctly.
  pagesRef: RefObject<ExtractedPage[]>;
  // Called only when the slide's page differs from currentPageIndexRef.current.
  onPageChange: (pageIndex: number) => void;
  // Called when the slide's fields live in a table that is NOT the one currently loaded into
  // that page's grid. The caller applies switchActiveTable(page, tableId) to its page state.
  onTableChange?: (pageIndex: number, tableId: string) => void;
}

// Replaces the near-identical onHover blocks in ProjectWorkspacePage,
// ValidationPage's ExtractedDataPanel onHover, and ValidationPage's
// handleSlideChange. All three do the same thing: turn a table fieldId (or
// list of them) into the matching bounding-box overlay id(s) on the document.
export function useFieldHover(
  defaultData: ExtractedPage | null | undefined,
  navigation?: UseFieldHoverNavigation
) {
  const [hoveredTableFieldIds, setHoveredTableFieldIds] = useState<string[]>([]);
  const [hoveredDocumentOverlayIds, setHoveredDocumentOverlayIds] = useState<string[]>([]);

  // Single-field hover (table cell -> single overlay), using the page passed at
  // call time or the hook's defaultData if none is given.
  const handleHover = useCallback(
    (fieldId: string | null, data: ExtractedPage | null | undefined = defaultData) => {
      const nextFieldIds = fieldId ? [fieldId] : [];
      setHoveredTableFieldIds((prev) => (sameIds(prev, nextFieldIds) ? prev : nextFieldIds));

      const overlayId = fieldId ? getOverlayIdForField(data, fieldId) : null;
      const nextOverlayIds = overlayId ? [overlayId] : [];
      setHoveredDocumentOverlayIds((prev) =>
        sameIds(prev, nextOverlayIds) ? prev : nextOverlayIds
      );
    },
    [defaultData]
  );

  // Multi-field hover (e.g. a review carousel highlighting several fields,
  // possibly on a page other than the currently-displayed one).
  const handleMultiHover = useCallback(
    (fieldIds: string[], data: ExtractedPage | null | undefined = defaultData) => {
      setHoveredTableFieldIds((prev) => (sameIds(prev, fieldIds) ? prev : fieldIds));

      const overlayIds = fieldIds
        .map((id) => getOverlayIdForField(data, id))
        .filter((id): id is string => Boolean(id));
      setHoveredDocumentOverlayIds((prev) => (sameIds(prev, overlayIds) ? prev : overlayIds));
    },
    [defaultData]
  );

  const clearHover = useCallback(() => {
    setHoveredTableFieldIds((prev) => (prev.length === 0 ? prev : []));
    setHoveredDocumentOverlayIds((prev) => (prev.length === 0 ? prev : []));
  }, []);

  // Carousel-driven navigation: a slide reports which fields it highlights
  // and, optionally, which page it belongs to. Only available when the
  // caller supplies `navigation` (page-based callers like ValidationPage);
  // omit it if there's only ever one page of data to hover against.
  const handleSlideChange = useCallback(
    (fieldIds: string[], pageIndex?: number) => {
      if (!navigation) {
        handleMultiHover(fieldIds);
        return;
      }
      const { currentPageIndexRef, pagesRef, onPageChange, onTableChange } = navigation;
      if (pageIndex !== undefined && pageIndex !== currentPageIndexRef.current) {
        onPageChange(pageIndex);
      }
      const contextPageIndex = pageIndex !== undefined ? pageIndex : currentPageIndexRef.current;
      const page = pagesRef.current[contextPageIndex];

      // Which table do these fields belong to? Derived from the field ids, so slides don't
      // have to report a tableId. Must also run for the CURRENT page: a page has several tables.
      const tableId = fieldIds.map((id) => findTableIdForField(page, id)).find(Boolean);
      if (page && tableId && tableId !== page.tableId) onTableChange?.(contextPageIndex, tableId);

      // Overlay lookup searches every table on the page, so this works before the switch lands.
      handleMultiHover(fieldIds, page);
    },
    [navigation, handleMultiHover]
  );

  return {
    hoveredTableFieldIds,
    hoveredDocumentOverlayIds,
    handleHover,
    handleMultiHover,
    handleSlideChange,
    clearHover,
    setHoveredTableFieldIds,
    setHoveredDocumentOverlayIds,
  };
}
