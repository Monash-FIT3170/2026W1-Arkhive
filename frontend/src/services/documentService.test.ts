import { describe, it, expect, vi, beforeEach } from 'vitest';
// This test file was generated with the assistance of Google Gemini.
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token-123' } },
      }),
    },
  },
  isSupabaseConfigured: true,
}));

import {
  uploadPageToR2,
  getDownloadUrl,
  getDocument,
  processPages,
  processDocumentPages,
  isStructuredDocument,
  rawResultToExtractedPages,
  saveExtractedData,
  deletePage,
  deleteDocument,
  saveReviewState,
} from './documentService';

describe('documentService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('uploadPageToR2', () => {
    it('uploads a page image with FormData, auth header, and stripped Content-Type', async () => {
      const mockResult = {
        documentId: 'doc-123',
        storageKey: 'user/proj/doc/page-0.png',
        pageIndex: 0,
        qualityFlags: { isBlurry: false, isDark: false, isInvalidSize: false, shouldWarn: false },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      } as any);

      const blob = new Blob(['fake-image-bytes'], { type: 'image/png' });
      const res = await uploadPageToR2('proj-1', blob, 'receipt.pdf', 0, 'doc-123');

      expect(res).toEqual(mockResult);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/upload-page'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-123',
          }),
        })
      );

      // Verify Content-Type was removed to let FormData generate boundary
      const callArgs = fetchSpy.mock.calls[0][1];
      expect(callArgs?.headers).not.toHaveProperty('Content-Type');
      expect(callArgs?.body).toBeInstanceOf(FormData);
    });

    it('throws error with message when upload fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid file format' }),
      } as any);

      const blob = new Blob(['content'], { type: 'text/plain' });
      await expect(uploadPageToR2('proj-1', blob, 'invalid.txt', 0)).rejects.toThrow(
        'Invalid file format'
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('requests document-level download URL when pageIndex is omitted', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ downloadUrl: 'https://r2.example.com/doc-full' }),
      } as any);

      const url = await getDownloadUrl('doc-1');
      expect(url).toBe('https://r2.example.com/doc-full');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/doc-1/download-url'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('requests page-specific download URL when pageIndex is provided', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ downloadUrl: 'https://r2.example.com/doc-page-2' }),
      } as any);

      const url = await getDownloadUrl('doc-1', 2);
      expect(url).toBe('https://r2.example.com/doc-page-2');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/doc-1/pages/2/url'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('throws descriptive error on failure status', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Document not found' }),
      } as any);

      await expect(getDownloadUrl('unknown-doc')).rejects.toThrow('Document not found');
    });
  });

  describe('getDocument', () => {
    it('retrieves document metadata and pages', async () => {
      const mockDoc = { id: 'doc-1', filename: 'invoice.pdf', pages: [] };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockDoc,
      } as any);

      const result = await getDocument('doc-1');
      expect(result).toEqual(mockDoc);
    });

    it('throws error when document fetch fails', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Database query failed' }),
      } as any);

      await expect(getDocument('doc-1')).rejects.toThrow('Database query failed');
    });
  });

  describe('processPages and processDocumentPages', () => {
    it('triggers batch OCR via processPages', async () => {
      const mockResponse = {
        success: true,
        summary: { totalRequested: 2, succeeded: 2, skipped: 0, failed: 0 },
        results: [],
        jobs: [],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const selections = [{ documentId: 'doc-1', pageIndices: [0, 1], force: true }];
      const result = await processPages(selections);

      expect(result).toEqual(mockResponse);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/process'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ selections }),
        })
      );
    });

    it('processDocumentPages wraps single document request with options', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as any);

      await processDocumentPages('doc-9', [0], true, 'receipt');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/process'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            selections: [{ documentId: 'doc-9', pageIndices: [0], force: true, docType: 'receipt' }],
          }),
        })
      );
    });

    it('throws when process endpoint returns error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'No pages selected' }),
      } as any);

      await expect(processPages([])).rejects.toThrow('No pages selected');
    });
  });

  describe('saveExtractedData', () => {
    it('patches extracted table data for a specific page', async () => {
      const mockExtractedPage: any = {
        pageIndex: 0,
        itemColumnKey: 'DESCRIPTION',
        rows: [{ id: 'r1', indentLevel: 0, cells: { DESCRIPTION: { text: 'Item 1' } } }],
      };

      const mockResponse = { page: { id: 'p-1', page_index: 0, extracted_data: mockExtractedPage } };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const res = await saveExtractedData('doc-1', 0, mockExtractedPage);

      expect(res).toEqual(mockResponse.page);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/doc-1/pages/0/data'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ extractedData: mockExtractedPage }),
        })
      );
    });

    it('patches extracted table data and history entries for a specific page', async () => {
      const mockExtractedPage: any = {
        pageIndex: 0,
        itemColumnKey: 'DESCRIPTION',
        rows: [{ id: 'r1', indentLevel: 0, cells: { DESCRIPTION: { text: 'Item 1' } } }],
      };

      const mockHistory: any = [
        {
          id: 'hist-1',
          type: 'edit',
          timestamp: '2026-10-17T00:00:00.000Z',
          description: 'Edited cell',
        },
      ];

      const mockResponse = {
        page: {
          id: 'p-1',
          page_index: 0,
          extracted_data: mockExtractedPage,
          history_entries: mockHistory,
        },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const res = await saveExtractedData('doc-1', 0, mockExtractedPage, mockHistory);

      expect(res).toEqual(mockResponse.page);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/doc-1/pages/0/data'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ extractedData: mockExtractedPage, historyEntries: mockHistory }),
        })
      );
    });
  });

  describe('saveReviewState', () => {
    it('patches review state for a specific page', async () => {
      const mockReview: any = {
        issues: [{ fieldId: 'r1_DESCRIPTION', fieldName: 'DESCRIPTION', rowId: 'r1' }],
        formatCheckOk: true,
      };

      const mockResponse = { page: { id: 'p-1', review_state: mockReview } };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as any);

      const res = await saveReviewState('doc-1', 0, mockReview);

      expect(res).toEqual(mockResponse.page);
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/doc-1/pages/0/review'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ reviewState: mockReview }),
        })
      );
    });
  });

  describe('deletePage and deleteDocument', () => {
    it('deletes single page with DELETE request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
      } as any);

      await deletePage('doc-1', 1);

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/doc-1/pages/1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('deletes entire document with DELETE request', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
      } as any);

      await deleteDocument('doc-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/documents/doc-1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('isStructuredDocument and rawResultToExtractedPages', () => {
    it('validates structured documents correctly', () => {
      const valid = {
        docType: 'invoice',
        pages: [{ pageIndex: 0, blocks: [] }],
      };
      expect(isStructuredDocument(valid)).toBe(true);

      expect(isStructuredDocument(null)).toBe(false);
      expect(isStructuredDocument(undefined)).toBe(false);
      expect(isStructuredDocument('not-object')).toBe(false);
      expect(isStructuredDocument([])).toBe(false);
      expect(isStructuredDocument({ docType: 123, pages: [] })).toBe(false);
      expect(isStructuredDocument({ docType: 'invoice', pages: [{ invalid: true }] })).toBe(false);
    });

    it('rawResultToExtractedPages returns null for non-structured documents', () => {
      expect(rawResultToExtractedPages(null)).toBeNull();
      expect(rawResultToExtractedPages({ legacy: true })).toBeNull();
    });

    it('rawResultToExtractedPages transforms valid structured document and applies indent levels', () => {
      const validDoc = {
        docType: 'invoice',
        pages: [
          {
            pageIndex: 0,
            blocks: [
              {
                id: 'b1',
                kind: 'table' as const,
                columns: [{ key: 'DESCRIPTION', name: 'Description' }],
                rows: [
                  {
                    id: 'r1',
                    level: 0,
                    cells: {
                      DESCRIPTION: { text: 'Parent Item', confidence: 0.95 },
                    },
                  },
                  {
                    id: 'r2',
                    level: 0,
                    cells: {
                      DESCRIPTION: { text: 'Child Item', confidence: 0.9 },
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = rawResultToExtractedPages(validDoc, { r2: 1 });
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      expect(result![0].pageIndex).toBe(0);
      expect(result![0].rows).toHaveLength(2);
      expect(result![0].rows[0]._id).toBe('r1');
      expect(result![0].rows[0]._indentLevel).toBe(0);
      expect(result![0].rows[1]._id).toBe('r2');
      expect(result![0].rows[1]._indentLevel).toBe(1);
    });
  });
});
