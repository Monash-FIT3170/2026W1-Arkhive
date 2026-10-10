import type { AnalyzeResultOutput } from '@azure-rest/ai-document-intelligence';
import type { Vertex } from '../../../models/Document';

/** Provider-neutral layout. Only this file knows Azure's response shape. */
export interface Span {
  offset: number;
  length: number;
}
export interface RawWord {
  text: string;
  confidence: number;
  polygon: Vertex[];
  offset: number;
  length: number;
}
export interface RawLine {
  id: string;
  text: string;
  polygon: Vertex[];
  offset: number;
  length: number;
  confidence: number;
}
export interface RawCell {
  rowIndex: number;
  columnIndex: number;
  isHeader: boolean;
  text: string;
  polygon: Vertex[];
  words: RawWord[];
}
export interface RawTable {
  id: string;
  rowCount: number;
  columnCount: number;
  cells: RawCell[];
  polygon: Vertex[];
  spans: Span[];
}
export interface RawPage {
  pageIndex: number;
  lines: RawLine[];
  tables: RawTable[];
}

export const toVertices = (flat: number[] = []): Vertex[] => {
  const out: Vertex[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
};

export const inSpans = (spans: Span[], offset: number, length: number) =>
  spans.some((s) => offset >= s.offset && offset + length <= s.offset + s.length);

export const minX = (p: Vertex[]) => (p.length ? Math.min(...p.map((v) => v.x)) : NaN);
export const height = (p: Vertex[]) =>
  p.length ? Math.max(...p.map((v) => v.y)) - Math.min(...p.map((v) => v.y)) : 0;

export function unionPolygon(polys: Vertex[][]): Vertex[] {
  const pts = polys.flat();
  if (!pts.length) return [];
  const x0 = Math.min(...pts.map((p) => p.x)),
    x1 = Math.max(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y)),
    y1 = Math.max(...pts.map((p) => p.y));
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);

export function toRawPages(result: AnalyzeResultOutput, pageOffset: number | undefined): RawPage[] {
  return (result.pages ?? []).map((p) => {
    const words: RawWord[] = (p.words ?? []).map((w) => ({
      text: w.content,
      confidence: w.confidence,
      polygon: toVertices(w.polygon),
      offset: w.span.offset,
      length: w.span.length,
    }));

    const lines: RawLine[] = (p.lines ?? []).map((l, i) => {
      const s = l.spans?.[0] ?? { offset: 0, length: 0 };
      const ws = words.filter((w) => inSpans([s], w.offset, w.length));
      return {
        id: `p${p.pageNumber}_l${i}`,
        text: l.content,
        polygon: toVertices(l.polygon),
        offset: s.offset,
        length: s.length,
        confidence: mean(ws.map((w) => w.confidence)),
      };
    });

    const tables: RawTable[] = (result.tables ?? [])
      .map((t, ti) => ({ t, ti }))
      .filter(({ t }) => t.boundingRegions?.[0]?.pageNumber === p.pageNumber) // multi-page tables: TODO stitch
      .map(({ t, ti }) => ({
        id: `t${ti}`,
        rowCount: t.rowCount,
        columnCount: t.columnCount,
        polygon: toVertices(t.boundingRegions?.[0]?.polygon),
        spans: t.spans ?? [],
        cells: t.cells.map((c) => ({
          rowIndex: c.rowIndex,
          columnIndex: c.columnIndex,
          isHeader: c.kind === 'columnHeader',
          text: (c.content ?? '').trim(),
          polygon: toVertices(c.boundingRegions?.[0]?.polygon),
          words: words.filter((w) => inSpans(c.spans ?? [], w.offset, w.length)),
        })),
      }));

    return { pageIndex: (pageOffset ?? 0) + (p.pageNumber - 1), lines, tables };
  });
}
