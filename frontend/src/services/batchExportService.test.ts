import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  exportBatchAsXLSX,
  exportBatchAsCSV,
  exportBatchAsJSON,
  exportBatchAsTXT
} from './batchExportService';
import type { DocumentJob } from '../models/Job';

describe('batchExportService', () => {
  let clickSpy: any;

  const mockJobs: DocumentJob[] = [
    {
      id: 'job-1',
      index: 0,
      fileName: 'Invoice_001.png',
      documentType: 'Invoice',
      imageIndex: 0,
      imageUrl: '/api/upload/image/0',
      status: 'completed',
      ocrData: [],
      confidence: 0.95,
      extractedData: {
        columns: ['ITEM', 'QTY', 'PRICE'],
        rows: [{ _id: '1', ITEM: 'Laptop', QTY: '1', PRICE: '$1200' }]
      },
      createdAt: 1000,
      updatedAt: 1000
    },
    {
      id: 'job-2',
      index: 1,
      fileName: 'Receipt_002.png',
      documentType: 'Receipt',
      imageIndex: 1,
      imageUrl: '/api/upload/image/1',
      status: 'completed',
      ocrData: [],
      confidence: 0.88,
      extractedData: {
        columns: ['ITEM', 'PRICE'],
        rows: [{ _id: '2', ITEM: 'Coffee', PRICE: '$4.50' }]
      },
      createdAt: 1000,
      updatedAt: 1000
    }
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('exports batch as multi-sheet XLSX workbook', () => {
    exportBatchAsXLSX(mockJobs, 'test-batch.xlsx');
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('exports batch as combined CSV', () => {
    exportBatchAsCSV(mockJobs, 'test-batch.csv');
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('exports batch as JSON', () => {
    exportBatchAsJSON(mockJobs, 'test-batch.json');
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('exports batch as TXT summary', () => {
    exportBatchAsTXT(mockJobs, 'test-batch.txt');
    expect(globalThis.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('handles empty jobs gracefully', () => {
    exportBatchAsXLSX([]);
    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
  });
});
