import { describe, it, expect } from 'vitest';
import {
  toVertices,
  inSpans,
  minX,
  height,
  yCentre,
  leftEdge,
  unionPolygon,
  sum,
  mean,
  median,
  groupBy,
  toRawPages,
  type RawWord,
} from './layout';
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

  it('is true when ANY of several spans contains the range', () => {
    const many = [
      { offset: 0, length: 5 },
      { offset: 20, length: 5 },
    ];
    expect(inSpans(many, 21, 2)).toBe(true);
    expect(inSpans(many, 4, 3)).toBe(false); // straddles the end of the first span
  });
});

describe('minX / height / yCentre', () => {
  it('minX returns the smallest x across the polygon, NaN when empty', () => {
    expect(
      minX([
        { x: 5, y: 0 },
        { x: 1, y: 1 },
        { x: 9, y: 2 },
      ])
    ).toBe(1);
    expect(minX([])).toBeNaN();
  });

  it('height returns the y-extent of the polygon, 0 when empty', () => {
    expect(
      height([
        { x: 0, y: 2 },
        { x: 0, y: 10 },
      ])
    ).toBe(8);
    expect(height([])).toBe(0);
  });

  it('yCentre returns the middle of the y-extent', () => {
    expect(
      yCentre([
        { x: 0, y: 2 },
        { x: 0, y: 10 },
      ])
    ).toBe(6);
  });
});

describe('leftEdge', () => {
  const w = (x: number): RawWord => ({
    text: 'w',
    confidence: 1,
    offset: 0,
    length: 1,
    polygon: [
      { x, y: 0 },
      { x: x + 1, y: 1 },
    ],
  });

  it('is the leftmost x over all words', () => {
    expect(leftEdge([w(5), w(2), w(9)])).toBe(2);
  });

  it('is null when there are no words (a cell box has no indent information)', () => {
    expect(leftEdge([])).toBeNull();
  });

  it('is null when no word has a polygon', () => {
    expect(leftEdge([{ ...w(1), polygon: [] }])).toBeNull();
  });
});

describe('unionPolygon', () => {
  it('returns the bounding box of all points across every polygon', () => {
    const box = unionPolygon([
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
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

describe('sum / mean / median / groupBy', () => {
  it('sum adds numbers, 0 for none', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([])).toBe(0);
  });

  it('mean averages; an empty list is 1 (no words = full confidence, not zero)', () => {
    expect(mean([0.5, 1])).toBeCloseTo(0.75);
    expect(mean([])).toBe(1);
  });

  it('median picks the middle (upper middle for even counts) without mutating the input', () => {
    const xs = [3, 1, 2];
    expect(median(xs)).toBe(2);
    expect(xs).toEqual([3, 1, 2]);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBe(0);
  });

  it('groupBy buckets in first-seen order, keeping item order inside a bucket', () => {
    const g = groupBy(['apple', 'avocado', 'banana', 'blueberry', 'cherry'], (s) => s[0]);
    expect([...g.keys()]).toEqual(['a', 'b', 'c']);
    expect(g.get('b')).toEqual(['banana', 'blueberry']);
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
          {
            content: 'Invoice',
            confidence: 0.9,
            polygon: [0, 0, 1, 0, 1, 1, 0, 1],
            span: { offset: 0, length: 7 },
          },
          {
            content: 'Total',
            confidence: 0.8,
            polygon: [2, 0, 3, 0, 3, 1, 2, 1],
            span: { offset: 8, length: 5 },
          },
        ],
        lines: [
          {
            content: 'Invoice Total',
            polygon: [0, 0, 3, 0, 3, 1, 0, 1],
            spans: [{ offset: 0, length: 13 }],
          },
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
    expect(page.lines[0].id).toBe('p1_l0');
    expect(page.lines[0].text).toBe('Invoice Total');
    expect(page.lines[0].confidence).toBeCloseTo((0.9 + 0.8) / 2);
  });

  it('pageOffset is optional and defaults to 0', () => {
    expect(toRawPages(azure)[0].pageIndex).toBe(0);
  });

  it("offsets pageIndex by pageOffset (each image is OCR'd alone, so Azure always reports pageNumber 1)", () => {
    const [page] = toRawPages(azure, 5);
    expect(page.pageIndex).toBe(5); // pageOffset 5 + (pageNumber 1 - 1)
  });

  it('maps Azure tables, trims cell text, flags header cells, and attaches overlapping words', () => {
    const [page] = toRawPages(azure, undefined);

    expect(page.tables).toHaveLength(1);
    const [table] = page.tables;
    expect(table.id).toBe('t0');
    expect(table.cells[0].text).toBe('Header'); // trimmed
    expect(table.cells[0].isHeader).toBe(true);
    expect(table.cells[0].words.map((w) => w.text)).toEqual(['Invoice']); // span overlap only
  });

  it('defaults rowSpan / columnSpan to 1 and passes explicit spans through', () => {
    const withSpan = {
      ...azure,
      tables: [
        {
          ...azure.tables![0],
          cells: [
            { rowIndex: 0, columnIndex: 0, content: 'plain', spans: [] },
            {
              rowIndex: 1,
              columnIndex: 0,
              content: 'merged',
              rowSpan: 3,
              columnSpan: 2,
              spans: [],
            },
          ],
        },
      ],
    } as unknown as AnalyzeResultOutput;

    const [{ tables }] = toRawPages(withSpan);
    expect(tables[0].cells.map((c) => [c.rowSpan, c.columnSpan])).toEqual([
      [1, 1],
      [3, 2],
    ]);
  });

  it('ignores a table whose boundingRegions point at a different page', () => {
    const otherPageAzure = {
      ...azure,
      tables: [{ ...azure.tables![0], boundingRegions: [{ pageNumber: 2, polygon: [] }] }],
    } as unknown as AnalyzeResultOutput;

    const [page] = toRawPages(otherPageAzure, undefined);
    expect(page.tables).toHaveLength(0);
  });

  it('table ids use the document-wide table index, not the per-page one', () => {
    const twoPages = {
      pages: [{ pageNumber: 1 }, { pageNumber: 2 }],
      tables: [
        { ...azure.tables![0], boundingRegions: [{ pageNumber: 1, polygon: [] }] },
        { ...azure.tables![0], boundingRegions: [{ pageNumber: 2, polygon: [] }] },
      ],
    } as unknown as AnalyzeResultOutput;

    const pages = toRawPages(twoPages);
    expect(pages.map((p) => p.tables.map((t) => t.id))).toEqual([['t0'], ['t1']]);
    expect(pages.map((p) => p.pageIndex)).toEqual([0, 1]);
  });

  it('defaults missing pages/lines/words/tables to empty arrays', () => {
    const empty = { pages: [{ pageNumber: 1 }] } as unknown as AnalyzeResultOutput;
    const [page] = toRawPages(empty, undefined);
    expect(page).toEqual({ pageIndex: 0, lines: [], tables: [] });
  });
});
