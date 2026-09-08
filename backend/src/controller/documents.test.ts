import { describe, it, expect, vi, beforeEach } from 'vitest';
import documentsController from './documents';
vi.mock('../services/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
      }),
    },
  },
  isSupabaseConfigured: false,
}));
import * as r2Client from '../services/r2Client';
import * as ocrService from '../services/ocr/ocr';

function createMockReqRes(
  userId: string | null = 'test-user-123',
  body = {},
  params = {},
  query = {}
) {
  const req: any = {
    userId: userId ?? undefined,
    body,
    params,
    query,
    headers: {},
  };
  let statusCode = 200;
  let jsonResponse: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      jsonResponse = data;
      return res;
    },
  };

  return { req, res, getStatus: () => statusCode, getJson: () => jsonResponse };
}

describe('Documents Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUploadUrl', () => {
    it('creates pending document and returns presigned upload URL', async () => {
      vi.spyOn(r2Client, 'generateUploadUrl').mockResolvedValue('https://r2.test/upload-presigned');

      const mockDoc = {
        id: 'doc-123',
        project_id: 'proj-1',
        filename: 'report.pdf',
        storage_path: 'test-user-123/proj-1/report.pdf',
        status: 'pending',
      };

      vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { id: 'proj-1' }, error: null }),
                }),
              }),
            }),
          } as any;
        }
        if (table === 'documents') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
              }),
            }),
          } as any;
        }
        return {} as any;
      });

      const { req, res, getStatus, getJson } = createMockReqRes('test-user-123', {
        projectId: 'proj-1',
        filename: 'report.pdf',
        contentType: 'application/pdf',
      });

      await documentsController.getUploadUrl(req, res);

      expect(getStatus()).toBe(201);
      expect(getJson().uploadUrl).toBe('https://r2.test/upload-presigned');
      expect(getJson().documentId).toBe('doc-123');
      expect(getJson().storageKey).toContain('test-user-123/proj-1/');
    });

    it('returns 403 if project is not owned by user', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
            }),
          }),
        }),
      } as any);

      const { req, res, getStatus } = createMockReqRes('test-user-123', {
        projectId: 'other-proj',
        filename: 'report.pdf',
      });

      await documentsController.getUploadUrl(req, res);

      expect(getStatus()).toBe(403);
    });
  });

  describe('getDownloadUrl', () => {
    it('returns presigned download URL when document belongs to user', async () => {
      vi.spyOn(r2Client, 'generateDownloadUrl').mockResolvedValue(
        'https://r2.test/download-presigned'
      );

      const mockDoc = {
        id: 'doc-123',
        filename: 'receipt.png',
        storage_path: 'user/proj/receipt.png',
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
            }),
          }),
        }),
      } as any);

      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        {},
        { id: 'doc-123' }
      );

      await documentsController.getDownloadUrl(req, res);

      expect(getStatus()).toBe(200);
      expect(getJson().downloadUrl).toBe('https://r2.test/download-presigned');
      expect(getJson().documentId).toBe('doc-123');
    });

    it('returns 404 when document does not exist or user does not own it', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
            }),
          }),
        }),
      } as any);

      const { req, res, getStatus } = createMockReqRes('test-user-123', {}, { id: 'doc-unknown' });

      await documentsController.getDownloadUrl(req, res);

      expect(getStatus()).toBe(404);
    });
  });

  describe('processDocument', () => {
    const mockDoc = {
      id: 'doc-123',
      filename: 'invoice.png',
      storage_path: 'user/proj/doc-123',
    };

    const mockOcrResult = [{ id: 'comp_1', text: 'Total: $50.00', confidence: 0.98 }];

    function mockOwnedDocument(updateImpl?: ReturnType<typeof vi.fn>) {
      const update =
        updateImpl ??
        vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        });

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
            }),
          }),
        }),
        update,
      } as any);

      return update;
    }

    it('downloads from R2, runs OCR pipeline, and returns rawResult without writing extracted_data', async () => {
      const update = mockOwnedDocument();
      vi.spyOn(r2Client, 'getObjectBuffer').mockResolvedValue(Buffer.from('fake-pdf-bytes'));
      vi.spyOn(ocrService, 'parseTableWithRetries').mockResolvedValue(mockOcrResult as any);

      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        {},
        { id: 'doc-123' }
      );

      await documentsController.processDocument(req, res);

      expect(getStatus()).toBe(200);
      expect(getJson().status).toBe('pending');
      expect(getJson().rawResult).toEqual([mockOcrResult]);
      expect(update.mock.calls.map((call) => call[0])).toEqual([
        { status: 'processing' },
        { status: 'pending' },
      ]);
    });

    it('sorts discovered page keys numerically (page-2 before page-10)', async () => {
      mockOwnedDocument();
      vi.spyOn(r2Client, 'listObjects').mockResolvedValue([
        'user/proj/doc-123/page-10.png',
        'user/proj/doc-123/page-2.png',
        'user/proj/doc-123/page-1.png',
      ]);
      const getObjectBufferSpy = vi
        .spyOn(r2Client, 'getObjectBuffer')
        .mockResolvedValue(Buffer.from('page'));
      vi.spyOn(ocrService, 'parseTableWithRetries').mockResolvedValue(mockOcrResult as any);

      const { req, res } = createMockReqRes('test-user-123', {}, { id: 'doc-123' });
      await documentsController.processDocument(req, res);

      expect(getObjectBufferSpy.mock.calls.map((call) => call[0])).toEqual([
        'user/proj/doc-123/page-1.png',
        'user/proj/doc-123/page-2.png',
        'user/proj/doc-123/page-10.png',
      ]);
    });

    it('sets status to error when OCR fails', async () => {
      const update = mockOwnedDocument();
      vi.spyOn(r2Client, 'getObjectBuffer').mockResolvedValue(Buffer.from('fake-pdf-bytes'));
      vi.spyOn(ocrService, 'parseTableWithRetries').mockRejectedValue(new Error('OCR exploded'));

      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        {},
        { id: 'doc-123' }
      );
      await documentsController.processDocument(req, res);

      expect(getStatus()).toBe(500);
      expect(getJson().error).toContain('OCR exploded');
      expect(update.mock.calls.map((call) => call[0])).toEqual([
        { status: 'processing' },
        { status: 'error' },
      ]);
    });
  });

  describe('saveExtractedData', () => {
    const mockDoc = {
      id: 'doc-123',
      filename: 'invoice.png',
      storage_path: 'user/proj/doc-123',
    };

    const extractedData = [
      {
        pageIndex: 0,
        columns: ['Item', 'Qty'],
        rows: [{ _id: 'r1', _cellConfidence: { Item: 0.9 } }],
        itemColumnKey: 'Item',
      },
    ];

    it('writes extracted_data and sets status to done when the user owns the project', async () => {
      const updatedDoc = { ...mockDoc, status: 'done', extracted_data: extractedData };
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedDoc, error: null }),
            }),
          }),
        }),
      } as any);

      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        { extractedData },
        { id: 'doc-123' }
      );

      await documentsController.saveExtractedData(req, res);

      expect(getStatus()).toBe(200);
      expect(getJson()).toEqual({
        success: true,
        documentId: 'doc-123',
        status: 'done',
        document: updatedDoc,
      });
    });

    it('returns 400 when extractedData is missing or not an array', async () => {
      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        { extractedData: { columns: [] } },
        { id: 'doc-123' }
      );

      await documentsController.saveExtractedData(req, res);

      expect(getStatus()).toBe(400);
      expect(getJson().error).toContain('extractedData');
    });

    it('returns 404 when document does not exist or user does not own it', async () => {
      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
            }),
          }),
        }),
      } as any);

      const { req, res, getStatus } = createMockReqRes(
        'test-user-123',
        { extractedData },
        { id: 'doc-unknown' }
      );

      await documentsController.saveExtractedData(req, res);

      expect(getStatus()).toBe(404);
    });
  });

  describe('deleteDocument', () => {
    it('deletes R2 object and DB record', async () => {
      const deleteObjectSpy = vi.spyOn(r2Client, 'deleteObject').mockResolvedValue();

      const mockDoc = {
        id: 'doc-123',
        storage_path: 'user/proj/file.pdf',
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
            }),
          }),
        }),
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      } as any);

      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        {},
        { id: 'doc-123' }
      );

      await documentsController.deleteDocument(req, res);

      expect(deleteObjectSpy).toHaveBeenCalledWith('user/proj/file.pdf');
      expect(getStatus()).toBe(200);
      expect(getJson()).toEqual({ success: true, documentId: 'doc-123' });
    });
  });

  describe('multi-page document features', () => {
    it('supports uploading a specific page of a multi-page document', async () => {
      vi.spyOn(r2Client, 'generateUploadUrl').mockResolvedValue('https://r2.test/page-1-presigned');

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'proj-1' }, error: null }),
            }),
          }),
        }),
      } as any);

      const { req, res, getStatus, getJson } = createMockReqRes('test-user-123', {
        projectId: 'proj-1',
        filename: 'multipage.pdf',
        documentId: 'doc-multi-1',
        pageIndex: 1,
        contentType: 'image/png',
      });

      await documentsController.getUploadUrl(req, res);

      expect(getStatus()).toBe(201);
      expect(getJson().pageIndex).toBe(1);
      expect(getJson().storageKey).toContain('/doc-multi-1/page-1.png');
    });

    it('retrieves presigned URL for a specific page of a document', async () => {
      vi.spyOn(r2Client, 'generateDownloadUrl').mockResolvedValue(
        'https://r2.test/download-page-1'
      );

      const mockDoc = {
        id: 'doc-123',
        filename: 'report.pdf',
        storage_path: 'user/proj/doc-123',
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
            }),
          }),
        }),
      } as any);

      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        {},
        { id: 'doc-123', pageIndex: '1' }
      );

      await documentsController.getDownloadUrl(req, res);

      expect(getStatus()).toBe(200);
      expect(getJson().downloadUrl).toBe('https://r2.test/download-page-1');
      expect(getJson().pageIndex).toBe(1);
    });

    it('deletes a single page from R2 storage', async () => {
      const deleteObjectSpy = vi.spyOn(r2Client, 'deleteObject').mockResolvedValue();

      const mockDoc = {
        id: 'doc-123',
        storage_path: 'user/proj/doc-123',
      };

      vi.spyOn(supabase, 'from').mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
            }),
          }),
        }),
      } as any);

      const { req, res, getStatus, getJson } = createMockReqRes(
        'test-user-123',
        {},
        { id: 'doc-123', pageIndex: '2' }
      );

      await documentsController.deletePage(req, res);

      expect(deleteObjectSpy).toHaveBeenCalledWith('user/proj/doc-123/page-2.png');
      expect(getStatus()).toBe(200);
      expect(getJson().pageIndex).toBe(2);
    });
  });
});
