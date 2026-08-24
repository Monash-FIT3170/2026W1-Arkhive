import { describe, test, expect } from 'vitest';
import type { OCRComponent } from '../../../../models/OCRComponent';
import type { UploadedFileGroup } from '../../../../models/UploadedFileGroup';
import {
  buildFallbackFileGroups,
  formatFileOptionLabel,
  getFirstPageIndex,
  getOcrDataForFile,
  getOcrDataForPage,
  getPageOptions,
} from './validationFileHelpers';

function makeComponent(overrides: Partial<OCRComponent> & { id: string }): OCRComponent {
  return {
    type: 'TABLE_ROW',
    indentation: 0,
    y: 0,
    layer: 0,
    text: '',
    confidence: 0.9,
    cells: [],
    boundingBoxes: {},
    ...overrides,
  };
}

describe('buildFallbackFileGroups', () => {
  test('groups OCR components by fileIndex and collects unique page indices', () => {
    const ocrData = [
      makeComponent({
        id: 'a',
        fileIndex: 0,
        fileName: 'invoice.pdf',
        pageIndex: 0,
      }),
      makeComponent({
        id: 'b',
        fileIndex: 0,
        fileName: 'invoice.pdf',
        pageIndex: 1,
      }),
      makeComponent({
        id: 'c',
        fileIndex: 1,
        fileName: 'receipt.png',
        pageIndex: 2,
      }),
      makeComponent({
        id: 'd',
        fileIndex: 0,
        fileName: 'invoice.pdf',
        pageIndex: 1,
      }),
    ];

    expect(buildFallbackFileGroups(ocrData)).toEqual([
      {
        fileIndex: 0,
        fileName: 'invoice.pdf',
        pageIndices: [0, 1],
      },
      {
        fileIndex: 1,
        fileName: 'receipt.png',
        pageIndices: [2],
      },
    ]);
  });

  test('returns a single default file when OCR data has no file tags', () => {
    const ocrData = [makeComponent({ id: 'legacy' })];

    expect(buildFallbackFileGroups(ocrData)).toEqual([
      {
        fileIndex: 0,
        fileName: 'Uploaded document',
        pageIndices: [0],
      },
    ]);
  });
});

describe('getOcrDataForFile', () => {
  const ocrData = [
    makeComponent({ id: 'file-0', fileIndex: 0, text: 'invoice' }),
    makeComponent({ id: 'file-1', fileIndex: 1, text: 'receipt' }),
  ];

  test('returns only components that belong to the selected file', () => {
    const result = getOcrDataForFile(ocrData, 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('file-1');
  });

  test('falls back to all OCR data when nothing is tagged for that file', () => {
    expect(getOcrDataForFile(ocrData, 9)).toEqual(ocrData);
  });
});

describe('getOcrDataForPage', () => {
  test('returns only components for the selected page when page tags exist', () => {
    const ocrData = [
      makeComponent({ id: 'p0', pageIndex: 0 }),
      makeComponent({ id: 'p1', pageIndex: 1 }),
    ];

    const result = getOcrDataForPage(ocrData, 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p1');
  });

  test('returns all OCR data when page tags are missing', () => {
    const ocrData = [makeComponent({ id: 'legacy' })];
    expect(getOcrDataForPage(ocrData, 0)).toEqual(ocrData);
  });
});

describe('getPageOptions', () => {
  test('uses OCR page labels when available and numbers remaining pages', () => {
    const file: UploadedFileGroup = {
      fileIndex: 0,
      fileName: 'invoice.pdf',
      pageIndices: [4, 5],
    };
    const fileOcrData = [
      makeComponent({ id: 'p4', pageIndex: 4, pageLabel: 'Page 1' }),
      makeComponent({ id: 'p5', pageIndex: 5 }),
    ];

    expect(getPageOptions(file, fileOcrData)).toEqual([
      { pageIndex: 4, label: 'Page 1' },
      { pageIndex: 5, label: 'Page 2' },
    ]);
  });

  test('returns an empty list when no file is selected', () => {
    expect(getPageOptions(undefined, [])).toEqual([]);
  });
});

describe('file dropdown selection', () => {
  test('switching files starts on the first page of that file', () => {
    const receipt: UploadedFileGroup = {
      fileIndex: 1,
      fileName: 'receipt.png',
      pageIndices: [3],
    };

    expect(getFirstPageIndex(receipt)).toBe(3);
  });

  test('falls back to page 0 when a file has no pages', () => {
    expect(
      getFirstPageIndex({
        fileIndex: 0,
        fileName: 'empty.pdf',
        pageIndices: [],
      })
    ).toBe(0);
  });

  test('dropdown labels include a 1-based position and the original file name', () => {
    expect(formatFileOptionLabel('invoice.pdf', 1)).toBe('1. invoice.pdf');
    expect(formatFileOptionLabel('receipt.png', 2)).toBe('2. receipt.png');
  });
});
