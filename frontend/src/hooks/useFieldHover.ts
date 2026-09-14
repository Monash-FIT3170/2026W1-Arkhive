import { useCallback, useState } from 'react';
import { getOverlayIdForField } from '../utils/tableOperations';
import type { ExtractedPage } from '../models/TableData';

// Replaces the near-identical onHover blocks in ProjectWorkspacePage,
// ValidationPage's ExtractedDataPanel onHover, and ValidationPage's
// handleSlideChange. All three do the same thing: turn a table fieldId (or
// list of them) into the matching bounding-box overlay id(s) on the document.
export function useFieldHover(defaultData: ExtractedPage | null | undefined) {
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

  return {
    hoveredTableFieldIds,
    hoveredDocumentOverlayIds,
    handleHover,
    handleMultiHover,
    clearHover,
    setHoveredTableFieldIds,
    setHoveredDocumentOverlayIds,
  };
}
