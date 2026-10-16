// Covers the current pipeline: preprocess -> Azure layout -> structureDocument,
// wrapped in a retry, plus the OCR_MODE=mock short-circuit used by CI / the
// integration suites so they never need real Azure/Gemini credentials. The old
// Google Vision textExtraction path is gone for good; see pipeline/*.test.ts
// for the structuring logic itself.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StructuredDocument } from '../../models/Document';

const { mockPrepareForOCR } = vi.hoisted(() => ({
  mockPrepareForOCR: vi.fn(),
}));
vi.mock('../ocrPreprocessor.js', () => ({
  prepareForOCR: mockPrepareForOCR,
}));

const { mockAnalyseResult } = vi.hoisted(() => ({
  mockAnalyseResult: vi.fn(),
}));
vi.mock('./utils/analyseBuffer.js', () => ({
  analyse_result: mockAnalyseResult,
}));

const { mockStructureDocument } = vi.hoisted(() => ({
  mockStructureDocument: vi.fn(),
}));
vi.mock('./pipeline/pipeline.js', () => ({
  structureDocument: mockStructureDocument,
}));

const { mockGetMockOcrResult } = vi.hoisted(() => ({
  mockGetMockOcrResult: vi.fn(),
}));
vi.mock('./mockOcrFixture.js', () => ({
  getMockOcrResult: mockGetMockOcrResult,
}));

import { parseDocumentWithRetries } from './ocr';

describe('ocr service', () => {
  const rawBuffer = Buffer.from('raw-image-bytes');
  const preprocessedBuffer = Buffer.from('preprocessed-bytes');
  const azureResult = { pages: [{ lines: [{ content: 'hi' }] }] };
  const structured: StructuredDocument = {
    docType: 'generic',
    docTypeConfidence: 0.8,
    pages: [{ pageIndex: 0, blocks: [] }],
  };
  const mockFixture: StructuredDocument = {
    docType: 'invoice',
    docTypeConfidence: 1,
    pages: [{ pageIndex: 0, blocks: [] }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OCR_MODE;
    mockPrepareForOCR.mockResolvedValue(preprocessedBuffer);
    mockAnalyseResult.mockResolvedValue(azureResult);
    mockStructureDocument.mockResolvedValue(structured);
    mockGetMockOcrResult.mockReturnValue(mockFixture);
  });

  afterEach(() => {
    delete process.env.OCR_MODE;
  });

  describe('OCR_MODE=mock', () => {
    it('returns the fixture and skips Azure/Gemini entirely', async () => {
      process.env.OCR_MODE = 'mock';

      const result = await parseDocumentWithRetries(rawBuffer, { pageOffset: 2 });

      expect(mockGetMockOcrResult).toHaveBeenCalledWith(2);
      expect(mockPrepareForOCR).not.toHaveBeenCalled();
      expect(mockAnalyseResult).not.toHaveBeenCalled();
      expect(mockStructureDocument).not.toHaveBeenCalled();
      expect(result).toBe(mockFixture);
    });

    it('defaults pageOffset to 0 when omitted', async () => {
      process.env.OCR_MODE = 'mock';

      await parseDocumentWithRetries(rawBuffer, {});

      expect(mockGetMockOcrResult).toHaveBeenCalledWith(0);
    });
  });

  describe('parseDocumentWithRetries', () => {
    it('runs preprocess -> analyse -> structure in order and returns the StructuredDocument', async () => {
      const result = await parseDocumentWithRetries(rawBuffer, {});

      expect(mockPrepareForOCR).toHaveBeenCalledWith(rawBuffer);
      expect(mockAnalyseResult).toHaveBeenCalledWith(preprocessedBuffer);
      expect(mockStructureDocument).toHaveBeenCalledWith(
        azureResult,
        expect.objectContaining({ docType: undefined, pageOffset: undefined })
      );
      expect(result).toBe(structured);
    });

    it('passes docType and pageOffset through to structureDocument', async () => {
      await parseDocumentWithRetries(rawBuffer, { docType: 'invoice', pageOffset: 3 });

      expect(mockStructureDocument).toHaveBeenCalledWith(
        azureResult,
        expect.objectContaining({ docType: 'invoice', pageOffset: 3 })
      );
    });

    it('does not retry a NoTextDetectedError', async () => {
      mockAnalyseResult.mockRejectedValue(
        new Error('NoTextDetectedError: No text detected in this page.')
      );

      await expect(parseDocumentWithRetries(rawBuffer, {})).rejects.toThrow('NoTextDetectedError');
      expect(mockAnalyseResult).toHaveBeenCalledTimes(1);
    });

    it('retries once on a transient failure, then succeeds', async () => {
      vi.useFakeTimers();
      mockAnalyseResult.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(azureResult);
      const onRetry = vi.fn();

      const promise = parseDocumentWithRetries(rawBuffer, {}, onRetry);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockAnalyseResult).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, 1);
      expect(result).toBe(structured);

      vi.useRealTimers();
    });

    it('gives up after exhausting retries', async () => {
      vi.useFakeTimers();
      mockAnalyseResult.mockRejectedValue(new Error('still broken'));

      const promise = parseDocumentWithRetries(rawBuffer, {});
      const expectation = expect(promise).rejects.toThrow('still broken');
      await vi.runAllTimersAsync();
      await expectation;

      expect(mockAnalyseResult).toHaveBeenCalledTimes(2); // 1 try + 1 retry (maxRetries = 1)

      vi.useRealTimers();
    });
  });
});
