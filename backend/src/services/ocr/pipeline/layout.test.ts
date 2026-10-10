import { describe, it, expect } from 'vitest';
import { toVertices, inSpans, minX, height, unionPolygon, toRawPages } from './layout';
import type { AnalyzeResultOutput } from '@azure-rest/ai-document-intelligence';

describe('toVertices', () => {
  it('pairs a flat [x,y,x,y,...] array into Vertex objects', () => {
    expect(toVertices([0, 0, 10, 0, 10, 5, 0, 5])).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]);
  });

  it('returns [] for an empty or missing array', () => {
    expect(toVertices([])).toEqual([]);
    expect(toVertices()).toEqual([]);
  });

  it('drops a trailing unpaired coordinate', () => {
    expect(toVertices([1, 2, 3])).toEqual([{ x: 1, y: 2 }]);
  });
});

describe('inSpans', () => {
  const spans = [{ offset: 10, length: 5 }]; // covers [10, 15)

  it('is true when the range is fully contained in a span', () => {
    expect(inSpans(spans, 10, 5)).toBe(true);
    expect(inSpans(spans, 11, 2)).toBe(true);
  });

  it('is false when the range starts before, ends after, or misses entirely', () => {
    expect(inSpans(spans, 9, 5)).toBe(false);
    expect(inSpans(spans, 12, 5)).toBe(false);
    expect(inSpans(spans, 100, 1)).toBe(false);
  });

  it('is false for an empty spans list', () => {
    expect(inSpans([], 0, 1)).toBe(false);
  });
});

describe('minX', () => {
  it('returns the smallest x across the polygon', () => {
    expect(minX([{ x: 5, y: 0 }, { x: 1, y: 1 }, { x: 9, y: 2 }])).toBe(1);
  });

  it('returns NaN for an empty polygon', () => {
    expect(minX([])).toBeNaN();
  });
});

describe('height', () => {
  it('returns the y-extent of the polygon', () => {
    expect(height([{ x: 0, y: 2 }, { x: 0, y: 10 }])).toBe(8);
  });

  it('returns 0 for an empty polygon', () => {
    expect(height([])).toBe(0);
  });
});

describe('unionPolygon', () => {
  it('returns the bounding box of all points across every polygon', () => {
    const box = unionPolygon([
      [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      [{ x: 10, y: -2 }],
    ]);
    expect(box).toEqual([
      { x: 0, y: -2 },
      { x: 10, y: -2 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ]);
  });

  it('returns [] when given no polygons or only empty ones', () => {
    expect(unionPolygon([])).toEqual([]);
    expect(unionPolygon([[], []])).toEqual([]);
  });
});

describe('toRawPages', () => {
  // Minimal Azure prebuilt-layout response: one page, one line split into two
  // words, one single-cell table with a header row.
  const azure = {
    pages: [
      {
        pageNumber: 1,
        words: [
          { content: 'Invoice', confidence: 0.9, polygon: [0, 0, 1, 0, 1, 1, 0, 1], span: { offset: 0, length: 7 } },
          { content: 'Total', confidence: 0.8, polygon: [2, 0, 3, 0, 3, 1, 2, 1], span: { offset: 8, length: 5 } },
        ],
        lines: [
          { content: 'Invoice Total', polygon: [0, 0, 3, 0, 3, 1, 0, 1], spans: [{ offset: 0, length: 13 }] },
        ],
      },
    ],
    tables: [
      {
        rowCount: 1,
        columnCount: 1,
        boundingRegions: [{ pageNumber: 1, polygon: [0, 2, 3, 2, 3, 3, 0, 3] }],
        spans: [{ offset: 20, length: 5 }],
        cells: [
          {
            rowIndex: 0,
            columnIndex: 0,
            kind: 'columnHeader',
            content: ' Header ',
            boundingRegions: [{ polygon: [0, 2, 1, 2, 1, 3, 0, 3] }],
            spans: [{ offset: 0, length: 7 }], // overlaps the "Invoice" word above
          },
        ],
      },
    ],
  } as unknown as AnalyzeResultOutput;

  it('converts Azure pages to 0-indexed RawPages with lines carrying mean word confidence', () => {
    const [page] = toRawPages(azure, undefined);

    expect(page.pageIndex).toBe(0); // pageNumber 1 -> index 0
    expect(page.lines).toHaveLength(1);
    expect(page.lines[0].text).toBe('Invoice Total');
    expect(page.lines[0].confidence).toBeCloseTo((0.9 + 0.8) / 2);
  });

  it('maps Azure tables, trims cell text, flags header cells, and attaches overlapping words', () => {
    const [page] = toRawPages(azure, undefined);

    expect(page.tables).toHaveLength(1);
    const [table] = page.tables;
    expect(table.cells[0].text).toBe('Header'); // trimmed
    expect(table.cells[0].isHeader).toBe(true);
    expect(table.cells[0].words.map((w) => w.text)).toEqual(['Invoice']); // span overlap only
  });

  it('ignores a table whose boundingRegions point at a different page', () => {
    const otherPageAzure = {
      ...azure,
      tables: [{ ...azure.tables![0], boundingRegions: [{ pageNumber: 2, polygon: [] }] }],
    } as unknown as AnalyzeResultOutput;

    const [page] = toRawPages(otherPageAzure, undefined);
    expect(page.tables).toHaveLength(0);
  });

  it('defaults missing pages/lines/words/tables to empty arrays', () => {
    const empty = { pages: [{ pageNumber: 1 }] } as unknown as AnalyzeResultOutput;
    const [page] = toRawPages(empty, undefined);
    expect(page).toEqual({ pageIndex: 0, lines: [], tables: [] });
  });
});
