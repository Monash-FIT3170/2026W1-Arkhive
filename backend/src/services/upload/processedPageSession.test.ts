import { describe, expect, it } from 'vitest';
import { retainProcessedPages } from './processedPageSession';

const documents = {
  fileA: {
    label: 'invoice.png',
    pages: { '0': 'a/0.png', '1': 'a/1.png' },
  },
  fileB: {
    label: 'receipt.png',
    pages: { '0': 'b/0.png' },
  },
};

describe('retainProcessedPages', () => {
  it('keeps pages from an earlier batch when a later batch is processed', () => {
    const first = retainProcessedPages({
      documents,
      updates: [{ documentId: 'fileA', pageIndex: '0', ocrData: [{ text: 'page A0' }] }],
      now: 1000,
    });

    const second = retainProcessedPages({
      documents,
      processedPages: first.processedPages,
      updates: [{ documentId: 'fileB', pageIndex: '0', ocrData: [{ text: 'page B0' }] }],
      createdAt: first.createdAt,
      now: 2000,
    });

    expect(second.processedImages).toEqual([
      '/api/upload/image/fileA/0',
      '/api/upload/image/fileB/0',
    ]);
    expect(second.ocrData.map((page) => page.text)).toEqual(['page A0', 'page B0']);
    expect(second.jobs.map((job) => job.fileName)).toEqual(['invoice.png', 'receipt.png']);
  });

  it('replaces a page when that same page is processed again', () => {
    const first = retainProcessedPages({
      documents,
      updates: [
        { documentId: 'fileA', pageIndex: '0', ocrData: [{ text: 'old' }] },
        { documentId: 'fileA', pageIndex: '1', ocrData: [{ text: 'keep' }] },
      ],
    });

    const again = retainProcessedPages({
      documents,
      processedPages: first.processedPages,
      updates: [{ documentId: 'fileA', pageIndex: '0', ocrData: [{ text: 'new' }] }],
    });

    expect(again.ocrData.map((page) => page.text)).toEqual(['new', 'keep']);
    expect(again.processedImages).toEqual([
      '/api/upload/image/fileA/0',
      '/api/upload/image/fileA/1',
    ]);
  });

  it('shows pages in document order even if a later page was processed first', () => {
    const retained = retainProcessedPages({
      documents,
      updates: [
        { documentId: 'fileA', pageIndex: '1', ocrData: [{ text: 'second' }] },
        { documentId: 'fileA', pageIndex: '0', ocrData: [{ text: 'first' }] },
      ],
    });

    expect(retained.ocrData.map((page) => page.text)).toEqual(['first', 'second']);
  });

  it('drops a processed page once it is no longer uploaded', () => {
    const retained = retainProcessedPages({
      documents,
      updates: [
        { documentId: 'fileA', pageIndex: '0', ocrData: [{ text: 'stay' }] },
        { documentId: 'fileA', pageIndex: '1', ocrData: [{ text: 'gone' }] },
      ],
    });

    const afterDelete = retainProcessedPages({
      documents: {
        ...documents,
        fileA: { ...documents.fileA, pages: { '0': 'a/0.png' } },
      },
      processedPages: retained.processedPages,
    });

    expect(afterDelete.ocrData.map((page) => page.text)).toEqual(['stay']);
    expect(afterDelete.processedImages).toEqual(['/api/upload/image/fileA/0']);
  });
});
