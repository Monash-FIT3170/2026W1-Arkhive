import type { Block, Vertex } from '../models/Document';

/**
 * One highlightable region on the page image. Replaces OCRComponent: it is
 * derived from the Block IR, so the document panel never sees Azure/Gemini shapes.
 *
 * Id conventions (these must match what the table / field UI emits on hover):
 *   table cell -> `${row.id}:${column.key}`   (same value as ExtractedRow._cellKeyMap)
 *   field/text -> the block's own id
 */
export interface PageOverlay {
  id: string;
  /** Row id for table cells, so hovering a whole row can light up all its cells. */
  groupId?: string;
  kind: 'cell' | 'field' | 'text';
  text: string;
  confidence: number; // 0..1
  page: number;
  polygon: Vertex[];
}

export function blocksToOverlays(blocks: Block[]): PageOverlay[] {
  const out: PageOverlay[] = [];
  for (const block of blocks) {
    if (block.kind === 'table') {
      for (const row of block.rows) {
        for (const [key, cell] of Object.entries(row.cells)) {
          if (!cell.region || cell.region.polygon.length === 0) continue;
          out.push({
            id: `${row.id}:${key}`,
            groupId: row.id,
            kind: 'cell',
            text: cell.text,
            confidence: cell.confidence,
            page: cell.region.page,
            polygon: cell.region.polygon,
          });
        }
      }
    } else if (block.region && block.region.polygon.length > 0) {
      out.push({
        id: block.id,
        kind: block.kind,
        text: block.kind === 'field' ? block.value : block.text,
        confidence: block.confidence,
        page: block.region.page,
        polygon: block.region.polygon,
      });
    }
  }
  return out;
}

/** Mean confidence of the overlays, or null when the page has none. */
export function averageOverlayConfidence(overlays: PageOverlay[]): number | null {
  if (overlays.length === 0) return null;
  return overlays.reduce((sum, o) => sum + o.confidence, 0) / overlays.length;
}
