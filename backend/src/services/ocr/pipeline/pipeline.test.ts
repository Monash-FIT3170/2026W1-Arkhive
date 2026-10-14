import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalyzeResultOutput } from '@azure-rest/ai-document-intelligence';
import type { StructuredDocument } from '../../../models/Document';
import { structureDocument, mergeStructured, documentConfidence } from './pipeline';

/** One page, one leftover text line, no tables — enough to exercise classify + a structurer. */
function azureWithLines(texts: string[]): AnalyzeResultOutput {
  return {
    pages: [
      {
        pageNumber: 1,
        lines: texts.map((text, i) => ({
          content: text,
          polygon: [0, i, text.length, i, text.length, i + 1, 0, i + 1],
          spans: [{ offset: i * 100, length: text.length }],
        })),
      },
    ],
    tables: [],
  } as unknown as AnalyzeResultOutput;
}

/** One page with a single-cell table (claims a line) plus one leftover line. */
function azureWithTableAndLeftover(): AnalyzeResultOutput {
  return {
    pages: [
      {
        pageNumber: 1,
        words: [
          { content: 'Widget', confidence: 0.9, polygon: [0, 5, 1, 5, 1, 6, 0, 6], span: { offset: 0, length: 6 } },
        ],
        lines: [
          { content: 'Widget', polygon: [0, 5, 3, 5, 3, 6, 0, 6], spans: [{ offset: 0, length: 6 }] },
          { content: 'Note', polygon: [0, 0, 3, 0, 3, 1, 0, 1], spans: [{ offset: 100, length: 4 }] },
        ],
      },
    ],
    tables: [
      {
        rowCount: 1,
        columnCount: 1,
        boundingRegions: [{ pageNumber: 1, polygon: [0, 5, 3, 5, 3, 6, 0, 6] }],
        spans: [{ offset: 0, length: 6 }],
        cells: [
          {
            rowIndex: 0,
            columnIndex: 0,
            kind: 'content',
            content: 'Widget',
            boundingRegions: [{ polygon: [0, 5, 1, 5, 1, 6, 0, 6] }],
            spans: [{ offset: 0, length: 6 }],
          },
        ],
      },
    ],
  } as unknown as AnalyzeResultOutput;
}

const llmResponse = (overrides: Record<string, any> = {}) =>
  JSON.stringify({ fields: [], tables: [], text: [], ...overrides });

describe('structureDocument', () => {
  let generateContent: ReturnType<typeof vi.fn>;
  let ai: any;

  beforeEach(() => {
    generateContent = vi.fn();
    ai = { models: { generateContent } };
  });

  it('skips classification when docType is given, and runs that profile\'s extractors without any LLM call', async () => {
    const doc = await structureDocument(azureWithTableAndLeftover(), { ai, docType: 'table' });

    expect(generateContent).not.toHaveBeenCalled(); // 'table' profile has no LLM step, and classify is skipped
    expect(doc.docType).toBe('table');
    expect(doc.docTypeConfidence).toBe(1);
    expect(doc.pages).toHaveLength(1);

    const kinds = doc.pages[0].blocks.map((b) => b.kind);
    expect(kinds).toEqual(['text', 'table']); // sorted by on-page position: leftover line (y=0) before table (y=5)
  });

  it('classifies from page 0 when docType is omitted, then uses the matched profile', async () => {
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify({ type: 'invoice', confidence: 0.8 }) }) // classify
      .mockResolvedValueOnce({ text: llmResponse({ text: [{ role: 'paragraph', text: 'Vendor: Acme', sources: [] }] }) }); // llmStructurer

    const doc = await structureDocument(azureWithLines(['Vendor: Acme']), { ai });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(doc.docType).toBe('invoice');
    expect(doc.docTypeConfidence).toBe(0.8);
    expect(doc.pages[0].blocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'text', text: 'Vendor: Acme' })])
    );
  });

  it('falls back to generic with confidence 0 when classification throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    generateContent
      .mockRejectedValueOnce(new Error('classify boom'))
      .mockResolvedValueOnce({ text: llmResponse() });

    const doc = await structureDocument(azureWithLines(['Some text']), { ai });

    expect(doc.docType).toBe('generic');
    expect(doc.docTypeConfidence).toBe(0);
    consoleSpy.mockRestore();
  });

  it('falls back to generic when classify returns a type that is not registered', async () => {
    generateContent
      .mockResolvedValueOnce({ text: JSON.stringify({ type: 'not_a_real_type', confidence: 0.9 }) })
      .mockResolvedValueOnce({ text: llmResponse() });

    const doc = await structureDocument(azureWithLines(['Some text']), { ai });

    expect(doc.docType).toBe('generic');
    expect(doc.docTypeConfidence).toBe(0); // the whole fallback object is used, not the reported confidence
  });

  it('never calls classify when the document has no pages', async () => {
    const doc = await structureDocument({ pages: [], tables: [] } as unknown as AnalyzeResultOutput, { ai });

    expect(generateContent).not.toHaveBeenCalled();
    expect(doc.docType).toBe('generic');
    expect(doc.docTypeConfidence).toBe(0);
    expect(doc.pages).toEqual([]);
  });

  it('degrades a page when an extractor throws, instead of failing the whole document', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    generateContent.mockRejectedValue(new Error('llm boom')); // docType given -> this is llmStructurer's own call

    const doc = await structureDocument(azureWithLines(['Some text']), { ai, docType: 'generic' });

    expect(doc.pages[0].blocks).toEqual([]); // nativeTableExtractor found nothing, llmStructurer threw
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('passes pageOffset through so the resulting page carries the real document-wide page index', async () => {
    const doc = await structureDocument(azureWithTableAndLeftover(), { ai, docType: 'table', pageOffset: 5 });
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].pageIndex).toBe(5);
  });
});

describe('mergeStructured', () => {
  it('keeps the docType/confidence of whichever document classified with the highest confidence', () => {
    const a: StructuredDocument = { docType: 'receipt', docTypeConfidence: 0.4, pages: [{ pageIndex: 1, blocks: [] }] };
    const b: StructuredDocument = { docType: 'invoice', docTypeConfidence: 0.9, pages: [{ pageIndex: 0, blocks: [] }] };

    const merged = mergeStructured([a, b]);

    expect(merged.docType).toBe('invoice');
    expect(merged.docTypeConfidence).toBe(0.9);
  });

  it('flattens every document\'s pages into one list sorted by pageIndex', () => {
    const a: StructuredDocument = { docType: 'generic', docTypeConfidence: 0.5, pages: [{ pageIndex: 2, blocks: [] }] };
    const b: StructuredDocument = { docType: 'generic', docTypeConfidence: 0.5, pages: [{ pageIndex: 0, blocks: [] }, { pageIndex: 1, blocks: [] }] };

    const merged = mergeStructured([a, b]);

    expect(merged.pages.map((p) => p.pageIndex)).toEqual([0, 1, 2]);
  });

  it('handles a single document', () => {
    const a: StructuredDocument = { docType: 'table', docTypeConfidence: 1, pages: [{ pageIndex: 0, blocks: [] }] };
    expect(mergeStructured([a])).toEqual(a);
  });
});

describe('documentConfidence', () => {
  it('averages confidence across every block on every page', () => {
    const doc: StructuredDocument = {
      docType: 'generic',
      docTypeConfidence: 1,
      pages: [
        { pageIndex: 0, blocks: [{ kind: 'text', id: '1', role: 'paragraph', text: 'a', confidence: 1 } as any] },
        { pageIndex: 1, blocks: [{ kind: 'text', id: '2', role: 'paragraph', text: 'b', confidence: 0.5 } as any] },
      ],
    };
    expect(documentConfidence(doc)).toBeCloseTo(0.75);
  });

  it('returns 0 for a document with no blocks', () => {
    const doc: StructuredDocument = { docType: 'generic', docTypeConfidence: 0, pages: [{ pageIndex: 0, blocks: [] }] };
    expect(documentConfidence(doc)).toBe(0);
  });
});
