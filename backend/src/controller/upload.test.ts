import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import uploadController from './upload';
import {
  INVALID_FILE_CONTENTS_ERROR,
  INVALID_UPLOAD_PATH_ERROR,
} from '../services/security/fileValidation';
// This test file was generated with the assistance of Google Gemini.
vi.mock('../services/imageProcessor', () => ({
  processImage: vi.fn(),
}));

vi.mock('../services/ocr/ocr', () => ({
  parseDocumentWithRetries: vi.fn(),
}));

import { processImage } from '../services/imageProcessor';
import { parseDocumentWithRetries } from '../services/ocr/ocr';

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function writeTempFile(data: Buffer, filename: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkhive-upload-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, data);
  return filePath;
}

function createMockReqRes(options: {
  session?: any;
  body?: any;
  params?: any;
  query?: any;
  file?: any;
} = {}) {
  const req: any = {
    session: options.session ?? { id: 'sess-123', documents: {} },
    body: options.body ?? {},
    params: options.params ?? {},
    query: options.query ?? {},
    file: options.file,
    headers: {},
  };

  let statusCode = 200;
  let jsonResponse: any = null;
  const writtenChunks: string[] = [];
  const headers: Record<string, string> = {};
  let ended = false;

  const res: any = {
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((data: any) => {
      jsonResponse = data;
      return res;
    }),
    setHeader: vi.fn((key: string, value: string) => {
      headers[key.toLowerCase()] = value;
      return res;
    }),
    write: vi.fn((chunk: string) => {
      writtenChunks.push(chunk);
      return true;
    }),
    end: vi.fn(() => {
      ended = true;
      return res;
    }),
    sendFile: vi.fn((filePath: string) => {
      jsonResponse = { sentFile: filePath };
      return res;
    }),
    get headersSent() {
      return writtenChunks.length > 0;
    },
  };

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getJsonResponse: () => jsonResponse,
    getWrittenChunks: () => writtenChunks,
    getHeaders: () => headers,
    isEnded: () => ended,
  };
}

describe('uploadPage file signature check', () => {
  it('keeps a file whose bytes match the claimed PNG type', async () => {
    const filePath = writeTempFile(PNG_HEADER, 'page-0.png');
    vi.mocked(processImage).mockResolvedValue({
      buffer: PNG_HEADER,
      qualityFlags: { isBlurry: false, isDark: false, isInvalidSize: false, shouldWarn: false },
    });

    const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
      session: { id: 'test-session' },
      file: { path: filePath, filename: 'page-0.png', mimetype: 'image/png' },
      query: { documentId: 'doc-1', pageIndex: '0' },
    });

    await uploadController.uploadPage(req, res);

    expect(getStatusCode()).toBe(200);
    expect(getJsonResponse().success).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(req.session.documents['doc-1']).toBeDefined();
  });

  it('rejects and deletes a file labelled PNG whose contents are fake', async () => {
    const filePath = writeTempFile(Buffer.from('fake-image-bytes'), 'page-0.png');
    const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
      session: { id: 'test-session' },
      file: { path: filePath, filename: 'page-0.png', mimetype: 'image/png' },
      query: { documentId: 'doc-1', pageIndex: '0' },
    });

    await uploadController.uploadPage(req, res);

    expect(getStatusCode()).toBe(400);
    expect(getJsonResponse()).toEqual({ error: INVALID_FILE_CONTENTS_ERROR });
    expect(fs.existsSync(filePath)).toBe(false);
    expect(req.session.documents).toBeUndefined();
  });
});

describe('uploadPage path traversal check', () => {
  it('rejects a documentId that walks out of the session folder', async () => {
    const filePath = writeTempFile(PNG_HEADER, 'page-0.png');
    const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
      session: { id: 'test-session' },
      file: { path: filePath, filename: 'page-0.png', mimetype: 'image/png' },
      query: { documentId: '../secret', pageIndex: '0' },
    });

    await uploadController.uploadPage(req, res);

    expect(getStatusCode()).toBe(400);
    expect(getJsonResponse()).toEqual({ error: INVALID_UPLOAD_PATH_ERROR });
    expect(req.session.documents).toBeUndefined();
  });

  it('rejects a pageIndex that is not a small whole number', async () => {
    const filePath = writeTempFile(PNG_HEADER, 'page-0.png');
    const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
      session: { id: 'test-session' },
      file: { path: filePath, filename: 'page-0.png', mimetype: 'image/png' },
      query: { documentId: 'doc-1', pageIndex: '0/../../x' },
    });

    await uploadController.uploadPage(req, res);

    expect(getStatusCode()).toBe(400);
    expect(getJsonResponse()).toEqual({ error: INVALID_UPLOAD_PATH_ERROR });
  });
});

describe('Upload Controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('uploadPage', () => {
    it('returns 400 when file, documentId, or pageIndex is missing', async () => {
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        query: { documentId: 'doc-1' },
      });

      await uploadController.uploadPage(req, res);

      expect(getStatusCode()).toBe(400);
      expect(getJsonResponse()).toEqual({ error: 'Missing file, documentId, or pageIndex.' });
    });

    it('processes image, saves to disk, updates session, and returns quality flags', async () => {
      const mockBuffer = Buffer.from('processed-png');
      const mockQualityFlags = {
        isBlurry: false,
        isDark: false,
        isInvalidSize: false,
        shouldWarn: false,
      };

      vi.mocked(processImage).mockResolvedValueOnce({
        buffer: mockBuffer,
        qualityFlags: mockQualityFlags,
      });

      vi.spyOn(fs, 'readFileSync').mockReturnValue(PNG_HEADER);
      const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const mockFile = {
        path: '/tmp/upload-xyz.png',
        filename: 'upload-xyz.png',
        mimetype: 'image/png',
      };

      const session: any = { id: 'session-456' };
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        session,
        file: mockFile,
        query: { documentId: 'doc-1', pageIndex: '0' },
        body: { label: 'Invoice 101' },
      });

      await uploadController.uploadPage(req, res);

      expect(getStatusCode()).toBe(200);
      expect(writeSpy).toHaveBeenCalledWith('/tmp/upload-xyz.png', mockBuffer);
      expect(session.documents['doc-1'].label).toBe('Invoice 101');
      expect(session.documents['doc-1'].pages['0']).toEqual({
        relativePath: path.join('session-456', 'doc-1', 'upload-xyz.png'),
        qualityFlags: mockQualityFlags,
      });
      expect(getJsonResponse()).toEqual({
        success: true,
        path: path.join('session-456', 'doc-1', 'upload-xyz.png'),
        qualityFlags: mockQualityFlags,
      });
    });

    it('returns 500 when image processing throws an error', async () => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(PNG_HEADER);
      vi.mocked(processImage).mockRejectedValueOnce(new Error('OpenCV error'));

      const mockFile = { path: '/tmp/upload.png', filename: 'upload.png', mimetype: 'image/png' };
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        file: mockFile,
        query: { documentId: 'doc-1', pageIndex: '0' },
      });

      await uploadController.uploadPage(req, res);

      expect(getStatusCode()).toBe(500);
      expect(getJsonResponse()).toEqual({ error: 'Failed to process image' });
    });
  });

  describe('deletePage', () => {
    it('unlinks file, deletes page, and cleans directory when document becomes empty', () => {
      const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
      const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const session: any = {
        id: 'sess-1',
        documents: {
          'doc-1': {
            pages: {
              '0': { relativePath: 'sess-1/doc-1/page-0.png' },
            },
          },
        },
      };

      const { req, res, getJsonResponse } = createMockReqRes({
        session,
        params: { documentId: 'doc-1', pageIndex: '0' },
      });

      uploadController.deletePage(req, res);

      expect(unlinkSpy).toHaveBeenCalledWith(path.join(process.cwd(), 'uploads', 'sess-1/doc-1/page-0.png'));
      expect(rmSpy).toHaveBeenCalledWith(
        path.join(process.cwd(), 'uploads', 'sess-1', 'doc-1'),
        { recursive: true, force: true }
      );
      expect(session.documents['doc-1']).toBeUndefined();
      expect(getJsonResponse()).toEqual({ success: true });
    });
  });

  describe('deleteDocument', () => {
    it('removes document directory and deletes document from session', () => {
      const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {});
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const session: any = {
        id: 'sess-1',
        documents: {
          'doc-1': { pages: {} },
        },
      };

      const { req, res, getJsonResponse } = createMockReqRes({
        session,
        params: { documentId: 'doc-1' },
      });

      uploadController.deleteDocument(req, res);

      expect(rmSpy).toHaveBeenCalledWith(
        path.join(process.cwd(), 'uploads', 'sess-1', 'doc-1'),
        { recursive: true, force: true }
      );
      expect(session.documents['doc-1']).toBeUndefined();
      expect(getJsonResponse()).toEqual({ success: true });
    });
  });

  describe('processDocuments', () => {
    it('returns 400 when selected list is missing or empty', async () => {
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        body: { selected: [] },
      });

      await uploadController.processDocuments(req, res);

      expect(getStatusCode()).toBe(400);
      expect(getJsonResponse()).toEqual({ error: 'No documents selected for processing.' });
    });

    it('returns 400 when selected files do not exist on disk', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const session: any = {
        id: 'sess-1',
        documents: {
          'doc-1': {
            pages: {
              '0': { relativePath: 'sess-1/doc-1/page-0.png' },
            },
          },
        },
      };

      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        session,
        body: {
          selected: [{ documentId: 'doc-1', pages: ['0'] }],
        },
      });

      await uploadController.processDocuments(req, res);

      expect(getStatusCode()).toBe(400);
      expect(getJsonResponse()).toEqual({ error: 'Selected files not found on disk.' });
    });

    it('processes batch documents and streams NDJSON events with success summary', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('image-bytes'));
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const mockOcrResult = {
        docType: 'receipt',
        docTypeConfidence: 0.95,
        pages: [
          {
            pageIndex: 0,
            blocks: [
              { id: 'b1', kind: 'field' as const, key: 'total', label: 'Total', value: '$25.00', confidence: 0.98 },
            ],
          },
        ],
      };

      vi.mocked(parseDocumentWithRetries).mockResolvedValueOnce(mockOcrResult as any);

      const session: any = {
        id: 'sess-1',
        documents: {
          'doc-1': {
            label: 'Store Receipt',
            pages: {
              '0': { relativePath: 'sess-1/doc-1/page-0.png' },
            },
          },
        },
      };

      const { req, res, getWrittenChunks, isEnded } = createMockReqRes({
        session,
        body: {
          selected: [{ documentId: 'doc-1', pages: ['0'] }],
        },
      });

      await uploadController.processDocuments(req, res);

      expect(isEnded()).toBe(true);
      const events = getWrittenChunks().map((chunk) => JSON.parse(chunk.trim()));

      expect(events[0]).toMatchObject({
        type: 'job_progress',
        fileName: 'Store Receipt',
        status: 'processing',
      });

      expect(events[1]).toMatchObject({
        type: 'job_completed',
        fileName: 'Store Receipt',
        confidence: 0.98,
      });

      const finalEvent = events[events.length - 1];
      expect(finalEvent.type).toBe('success');
      expect(finalEvent.data.success).toBe(true);
      expect(finalEvent.data.jobs).toHaveLength(1);
      expect(finalEvent.data.jobs[0].status).toBe('completed');

      expect(session.jobs).toHaveLength(1);
      expect(session.extraction.ocrData).toHaveLength(1);
      expect(session.extraction.processedImages).toEqual(['/api/upload/image/doc-1/0']);
    });

    it('handles individual document OCR failure gracefully without crashing the batch', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('image-bytes'));
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
      vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      vi.mocked(parseDocumentWithRetries).mockRejectedValueOnce(
        new Error('NoTextDetectedError: Document is completely blank.')
      );

      const session: any = {
        id: 'sess-1',
        documents: {
          'doc-fail': {
            label: 'Blank Page',
            pages: {
              '0': { relativePath: 'sess-1/doc-fail/p0.png' },
            },
          },
        },
      };

      const { req, res, getWrittenChunks, isEnded } = createMockReqRes({
        session,
        body: {
          selected: [{ documentId: 'doc-fail', pages: ['0'] }],
        },
      });

      await uploadController.processDocuments(req, res);

      expect(isEnded()).toBe(true);
      const events = getWrittenChunks().map((chunk) => JSON.parse(chunk.trim()));

      const failedEvent = events.find((e) => e.type === 'job_failed');
      expect(failedEvent).toBeDefined();
      expect(failedEvent.message).toBe('Document is completely blank.');

      const finalEvent = events[events.length - 1];
      expect(finalEvent.type).toBe('success');
      expect(finalEvent.data.jobs[0].status).toBe('failed');
      // Failed jobs are excluded from extraction ocrData
      expect(session.extraction.ocrData).toEqual([]);
    });
  });

  describe('getDocuments and getJobs', () => {
    it('getDocuments formats session documents and pages', () => {
      const session: any = {
        documents: {
          'doc-1': {
            label: 'Tax Return',
            pages: {
              '0': {
                relativePath: 'sess/doc-1/0.png',
                qualityFlags: { isBlurry: false },
              },
            },
          },
        },
      };

      const { req, res, getJsonResponse } = createMockReqRes({ session });
      uploadController.getDocuments(req, res);

      expect(getJsonResponse()).toEqual([
        {
          documentId: 'doc-1',
          label: 'Tax Return',
          pages: [
            {
              url: '/api/upload/image/doc-1/0',
              qualityFlags: { isBlurry: false },
            },
          ],
        },
      ]);
    });

    it('getJobs returns batchId and jobs from session', () => {
      const mockJobs = [{ id: 'job-1', status: 'completed' }];
      const session: any = {
        batchId: 'batch-99',
        jobs: mockJobs,
      };

      const { req, res, getJsonResponse } = createMockReqRes({ session });
      uploadController.getJobs(req, res);

      expect(getJsonResponse()).toEqual({
        batchId: 'batch-99',
        jobs: mockJobs,
      });
    });
  });

  describe('getImage, getFirstImage, and getProcessedImages', () => {
    it('getImage returns 404 when image is not in session', () => {
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        params: { documentId: 'doc-x', pageIndex: '0' },
      });

      uploadController.getImage(req, res);

      expect(getStatusCode()).toBe(404);
      expect(getJsonResponse()).toEqual({ error: 'Image not found in session.' });
    });

    it('getImage returns 404 when file does not exist on disk', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const session: any = {
        documents: {
          'doc-1': {
            pages: { '0': { relativePath: 'missing.png' } },
          },
        },
      };

      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        session,
        params: { documentId: 'doc-1', pageIndex: '0' },
      });

      uploadController.getImage(req, res);

      expect(getStatusCode()).toBe(404);
      expect(getJsonResponse()).toEqual({ error: 'Image file not found on disk.' });
    });

    it('getImage sends file when file exists', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const session: any = {
        documents: {
          'doc-1': {
            pages: { '0': { relativePath: 'sess/doc-1/p0.png' } },
          },
        },
      };

      const { req, res, getJsonResponse } = createMockReqRes({
        session,
        params: { documentId: 'doc-1', pageIndex: '0' },
      });

      uploadController.getImage(req, res);

      expect(getJsonResponse()).toEqual({
        sentFile: path.join(process.cwd(), 'uploads', 'sess/doc-1/p0.png'),
      });
    });

    it('getFirstImage returns 404 when no documents are uploaded', () => {
      const { req, res, getStatusCode, getJsonResponse } = createMockReqRes({
        session: {},
      });

      uploadController.getFirstImage(req, res);

      expect(getStatusCode()).toBe(404);
      expect(getJsonResponse()).toEqual({ error: 'No documents found.' });
    });

    it('getProcessedImages returns processed image URLs from session', () => {
      const session: any = {
        extraction: {
          processedImages: ['/api/upload/image/doc-1/0', '/api/upload/image/doc-1/1'],
        },
      };

      const { req, res, getJsonResponse } = createMockReqRes({ session });
      uploadController.getProcessedImages(req, res);

      expect(getJsonResponse()).toEqual([
        '/api/upload/image/doc-1/0',
        '/api/upload/image/doc-1/1',
      ]);
    });
  });
});
