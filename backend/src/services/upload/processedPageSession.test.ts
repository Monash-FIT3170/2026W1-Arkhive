import { describe, expect, it } from 'vitest';
import { retainProcessedPages } from './processedPageSession';

const page = (text: string) => ({
  pageIndex: 0,
  blocks: [{ id: 'b1', kind: 'field' as const, key: 'total', label: 'Total', value: text, confidence: 1 }],
});

const documents = {
  fileA: {
    label: 'invoice.png',
    pages: { '0': { relativePath: 'a/0.png' }, '1': { relativePath: 'a/1.png' } },
  },
  fileB: {
    label: 'receipt.png',
    pages: { '0': { relativePath: 'b/0.png' } },
  },
};

describe('retainProcessedPages', () => {
  it('keeps pages from an earlier batch when a later batch is processed', () => {
    const first = retainProcessedPages({
      documents,
      updates: [{ documentId: 'fileA', pageIndex: '0', ocrData: [page('page A0')] }],
      now: 1000,
    });

    const second = retainProcessedPages({
      documents,
      processedPages: first.processedPages,
      updates: [{ documentId: 'fileB', pageIndex: '0', ocrData: [page('page B0')] }],
      createdAt: first.createdAt,
      now: 2000,
    });

    expect(second.processedImages).toEqual([
      '/api/upload/image/fileA/0',
      '/api/upload/image/fileB/0',
    ]);
    expect(second.ocrData.map((item) => item.blocks[0].value)).toEqual(['page A0', 'page B0']);
  });

  it('replaces a page when that same page is processed again', () => {
    const first = retainProcessedPages({
      documents,
      updates: [
        { documentId: 'fileA', pageIndex: '0', ocrData: [page('old')] },
        { documentId: 'fileA', pageIndex: '1', ocrData: [page('keep')] },
      ],
    });

    const again = retainProcessedPages({
      documents,
      processedPages: first.processedPages,
      updates: [{ documentId: 'fileA', pageIndex: '0', ocrData: [page('new')] }],
    });

    expect(again.ocrData.map((item) => item.blocks[0].value)).toEqual(['new', 'keep']);
  });

  it('drops a processed page once it is no longer uploaded', () => {
    const retained = retainProcessedPages({
      documents,
      updates: [
        { documentId: 'fileA', pageIndex: '0', ocrData: [page('stay')] },
        { documentId: 'fileA', pageIndex: '1', ocrData: [page('gone')] },
      ],
    });

    const afterDelete = retainProcessedPages({
      documents: {
        ...documents,
        fileA: { ...documents.fileA, pages: { '0': { relativePath: 'a/0.png' } } },
      },
      processedPages: retained.processedPages,
    });

    expect(afterDelete.ocrData.map((item) => item.blocks[0].value)).toEqual(['stay']);
  });
});
