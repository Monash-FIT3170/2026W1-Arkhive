import type { AnalyzeResultOutput } from '@azure-rest/ai-document-intelligence';
import type { Vertex } from '../../../models/Document';

/** Provider-neutral layout. Only this file knows Azure's response shape. */

// ───────────── Types ─────────────
export interface Span {
  offset: number;
  length: number;
}
export interface RawWord extends Span {
  text: string;
  confidence: number;
  polygon: Vertex[];
}
export interface RawLine extends Span {
  id: string;
  text: string;
  polygon: Vertex[];
  confidence: number;
}
export interface RawCell {
  rowIndex: number;
  columnIndex: number;
  /** Merged cells are reported ONCE, on their first row/column; spans default to 1. */
  rowSpan: number;
  columnSpan: number;
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

// ───────────── Small pure helpers (shared by every extractor) ─────────────
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 1);
export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};
export const groupBy = <T, K>(xs: T[], key: (x: T) => K): Map<K, T[]> =>
  xs.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) ?? []), x]), new Map<K, T[]>());

// ───────────── Geometry ─────────────
export const toVertices = (flat: number[] = []): Vertex[] =>
  Array.from({ length: Math.floor(flat.length / 2) }, (_, i) => ({
    x: flat[2 * i],
    y: flat[2 * i + 1],
  }));

const xs = (p: Vertex[]) => p.map((v) => v.x);
const ys = (p: Vertex[]) => p.map((v) => v.y);

export const minX = (p: Vertex[]) => (p.length ? Math.min(...xs(p)) : NaN);
export const height = (p: Vertex[]) => (p.length ? Math.max(...ys(p)) - Math.min(...ys(p)) : 0);
export const yCentre = (p: Vertex[]) => (Math.min(...ys(p)) + Math.max(...ys(p))) / 2;

/** Left edge of the leftmost word, or null when there are no words (a cell box has no indent info). */
export const leftEdge = (words: RawWord[]): number | null => {
  const x = Math.min(...words.map((w) => minX(w.polygon)));
  return Number.isFinite(x) ? x : null;
};

/** Axis-aligned box around several polygons. */
export function unionPolygon(polys: Vertex[][]): Vertex[] {
  const pts = polys.flat();
  if (!pts.length) return [];
  const [x0, x1] = [Math.min(...xs(pts)), Math.max(...xs(pts))];
  const [y0, y1] = [Math.min(...ys(pts)), Math.max(...ys(pts))];
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

// ───────────── Spans ─────────────
export const inSpans = (spans: Span[], offset: number, length: number) =>
  spans.some((s) => offset >= s.offset && offset + length <= s.offset + s.length);

const wordsIn = (words: RawWord[], spans: Span[]) =>
  words.filter((w) => inSpans(spans, w.offset, w.length));

// ───────────── Azure → Raw ─────────────
type AzurePage = NonNullable<AnalyzeResultOutput['pages']>[number];
type AzureTable = NonNullable<AnalyzeResultOutput['tables']>[number];

type AzureWord = NonNullable<AzurePage['words']>[number];
type AzureLine = NonNullable<AzurePage['lines']>[number];

const toWord = (w: AzureWord): RawWord => ({
  text: w.content,
  confidence: w.confidence,
  polygon: toVertices(w.polygon),
  offset: w.span.offset,
  length: w.span.length,
});

const toLine =
  (pageNumber: number, words: RawWord[]) =>
  (l: AzureLine, i: number): RawLine => {
    const span = l.spans?.[0] ?? { offset: 0, length: 0 };
    return {
      id: `p${pageNumber}_l${i}`,
      text: l.content,
      polygon: toVertices(l.polygon),
      offset: span.offset,
      length: span.length,
      confidence: mean(wordsIn(words, [span]).map((w) => w.confidence)),
    };
  };

const toTable =
  (id: string, words: RawWord[]) =>
  (t: AzureTable): RawTable => ({
    id,
    rowCount: t.rowCount,
    columnCount: t.columnCount,
    polygon: toVertices(t.boundingRegions?.[0]?.polygon),
    spans: t.spans ?? [],
    cells: t.cells.map((c) => ({
      rowIndex: c.rowIndex,
      columnIndex: c.columnIndex,
      rowSpan: c.rowSpan ?? 1,
      columnSpan: c.columnSpan ?? 1,
      isHeader: c.kind === 'columnHeader',
      text: (c.content ?? '').trim(),
      polygon: toVertices(c.boundingRegions?.[0]?.polygon),
      words: wordsIn(words, c.spans ?? []),
    })),
  });

export function toRawPages(result: AnalyzeResultOutput, pageOffset = 0): RawPage[] {
  return (result.pages ?? []).map((p) => {
    const words = (p.words ?? []).map(toWord);
    const tables = (result.tables ?? [])
      .map((t, i) => ({ t, id: `t${i}` }))
      .filter(({ t }) => t.boundingRegions?.[0]?.pageNumber === p.pageNumber) // multi-page tables: TODO stitch
      .map(({ t, id }) => toTable(id, words)(t));

    return {
      pageIndex: pageOffset + (p.pageNumber - 1),
      lines: (p.lines ?? []).map(toLine(p.pageNumber, words)),
      tables,
    };
  });
}
