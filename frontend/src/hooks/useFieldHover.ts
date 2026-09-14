import { useCallback, useState, type RefObject } from 'react';
import type { ExtractedPage } from '../models/TableData';
import { getOverlayIdForField } from '../utils/tableOperations';

interface UseFieldHoverNavigation {
  // Ref to the currently-displayed page index, read synchronously so
  // handleSlideChange never acts on a stale value.
  currentPageIndexRef: RefObject<number>;
  // Ref to all pages, so slides for a page other than the current one can
  // still resolve overlay ids correctly.
  pagesRef: RefObject<ExtractedPage[]>;
  // Called only when the slide's page differs from currentPageIndexRef.current.
  onPageChange: (pageIndex: number) => void;
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
      setHoveredTableFieldIds(fieldId ? [fieldId] : []);
      const overlayId = fieldId ? getOverlayIdForField(data, fieldId) : null;
      setHoveredDocumentOverlayIds(overlayId ? [overlayId] : []);
    },
    [defaultData]
  );

  // Multi-field hover (e.g. a review carousel highlighting several fields,
  // possibly on a page other than the currently-displayed one).
  const handleMultiHover = useCallback(
    (fieldIds: string[], data: ExtractedPage | null | undefined = defaultData) => {
      setHoveredTableFieldIds(fieldIds);
      const overlayIds = fieldIds
        .map((id) => getOverlayIdForField(data, id))
        .filter((id): id is string => Boolean(id));
      setHoveredDocumentOverlayIds(overlayIds);
    },
    [defaultData]
  );

  const clearHover = useCallback(() => {
    setHoveredTableFieldIds([]);
    setHoveredDocumentOverlayIds([]);
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
      const { currentPageIndexRef, pagesRef, onPageChange } = navigation;
      if (pageIndex !== undefined && pageIndex !== currentPageIndexRef.current) {
        onPageChange(pageIndex);
      }
      const contextPageIndex = pageIndex !== undefined ? pageIndex : currentPageIndexRef.current;
      handleMultiHover(fieldIds, pagesRef.current[contextPageIndex]);
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
