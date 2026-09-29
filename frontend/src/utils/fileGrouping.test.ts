import { describe, it, expect } from 'vitest';
import {
  groupPagesByFiles,
  getGlobalIndex,
  getFileAndLocalPage,
} from './fileGrouping';
import type { ExtractedPage } from '../models/TableData';
import type { OCRComponent } from '../models/OCRComponent';

describe('fileGrouping utility', () => {
  const mockPages: ExtractedPage[] = [
    { pageIndex: 0, columns: ['A'], itemColumnKey: 'A', rows: [{ _id: '1', A: 'val1', _cellConfidence: {} }] },
    { pageIndex: 1, columns: ['A'], itemColumnKey: 'A', rows: [{ _id: '2', A: 'val2', _cellConfidence: {} }] },
    { pageIndex: 2, columns: ['B'], itemColumnKey: 'B', rows: [{ _id: '3', B: 'val3', _cellConfidence: {} }] },
    { pageIndex: 3, columns: ['C'], itemColumnKey: 'C', rows: [{ _id: '4', C: 'val4', _cellConfidence: {} }] },
  ];

  const mockOcrPages: OCRComponent[][] = [
    [{ id: 'c1', type: 'TABLE_ROW', indentation: 0, y: 0, layer: 0, text: 't1', confidence: 0.9 }],
    [{ id: 'c2', type: 'TABLE_ROW', indentation: 0, y: 0, layer: 0, text: 't2', confidence: 0.8 }],
    [{ id: 'c3', type: 'TABLE_ROW', indentation: 0, y: 0, layer: 0, text: 't3', confidence: 0.95 }],
    [{ id: 'c4', type: 'TABLE_ROW', indentation: 0, y: 0, layer: 0, text: 't4', confidence: 0.7 }],
  ];

  const mockImageUrls = [
    'http://img/1.png',
    'http://img/2.png',
    'http://img/3.png',
    'http://img/4.png',
  ];

  it('groups pages using explicit fileMetadata', () => {
    const fileMetadata = [
      { fileId: 'doc-1', fileName: 'Invoice.pdf', pageCount: 2 },
      { fileId: 'doc-2', fileName: 'Receipt.png', pageCount: 1 },
      { fileId: 'doc-3', fileName: 'Statement.pdf', pageCount: 1 },
    ];

    const groups = groupPagesByFiles(
      mockPages,
      mockOcrPages,
      mockImageUrls,
      undefined,
      fileMetadata
    );

    expect(groups).toHaveLength(3);
    expect(groups[0].fileName).toBe('Invoice.pdf');
    expect(groups[0].pages).toHaveLength(2);
    expect(groups[0].pages[0].pageIndexInFile).toBe(0);
    expect(groups[0].pages[0].globalIndex).toBe(0);
    expect(groups[0].pages[1].pageIndexInFile).toBe(1);
    expect(groups[0].pages[1].globalIndex).toBe(1);

    expect(groups[1].fileName).toBe('Receipt.png');
    expect(groups[1].pages).toHaveLength(1);
    expect(groups[1].pages[0].pageIndexInFile).toBe(0);
    expect(groups[1].pages[0].globalIndex).toBe(2);

    expect(groups[2].fileName).toBe('Statement.pdf');
    expect(groups[2].pages).toHaveLength(1);
    expect(groups[2].pages[0].pageIndexInFile).toBe(0);
    expect(groups[2].pages[0].globalIndex).toBe(3);
  });

  it('groups pages using pageKeys with docId:pageIndex pattern', () => {
    const pageKeys = ['doc-A:0', 'doc-A:1', 'doc-B:0', 'doc-B:1'];

    const groups = groupPagesByFiles(
      mockPages,
      mockOcrPages,
      mockImageUrls,
      pageKeys
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].fileId).toBe('doc-A');
    expect(groups[0].pages).toHaveLength(2);
    expect(groups[1].fileId).toBe('doc-B');
    expect(groups[1].pages).toHaveLength(2);
  });

  it('falls back to single file group if no metadata or pageKeys given', () => {
    const groups = groupPagesByFiles(mockPages, mockOcrPages, mockImageUrls);

    expect(groups).toHaveLength(1);
    expect(groups[0].pages).toHaveLength(4);
    expect(groups[0].fileName).toBe('Uploaded Document');
  });

  it('correctly maps between local file/page coordinates and global index', () => {
    const fileMetadata = [
      { fileId: 'doc-1', fileName: 'Doc1.pdf', pageCount: 2 },
      { fileId: 'doc-2', fileName: 'Doc2.pdf', pageCount: 2 },
    ];

    const groups = groupPagesByFiles(
      mockPages,
      mockOcrPages,
      mockImageUrls,
      undefined,
      fileMetadata
    );

    // Test getGlobalIndex
    expect(getGlobalIndex(groups, 0, 0)).toBe(0);
    expect(getGlobalIndex(groups, 0, 1)).toBe(1);
    expect(getGlobalIndex(groups, 1, 0)).toBe(2);
    expect(getGlobalIndex(groups, 1, 1)).toBe(3);

    // Test getFileAndLocalPage
    expect(getFileAndLocalPage(groups, 0)).toEqual({ fileIndex: 0, pageIndexInFile: 0 });
    expect(getFileAndLocalPage(groups, 1)).toEqual({ fileIndex: 0, pageIndexInFile: 1 });
    expect(getFileAndLocalPage(groups, 2)).toEqual({ fileIndex: 1, pageIndexInFile: 0 });
    expect(getFileAndLocalPage(groups, 3)).toEqual({ fileIndex: 1, pageIndexInFile: 1 });
  });

  it('returns empty array when pages are empty', () => {
    expect(groupPagesByFiles([], [])).toEqual([]);
  });
});
