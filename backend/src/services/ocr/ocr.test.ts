// Covers the current pipeline: preprocess -> Azure layout -> structureDocument,
// wrapped in a retry. The old Google Vision textExtraction / mock-mode path was
// removed; see pipeline/pipeline.test.ts etc. for the structuring logic itself.
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepareForOCR.mockResolvedValue(preprocessedBuffer);
    mockAnalyseResult.mockResolvedValue(azureResult);
    mockStructureDocument.mockResolvedValue(structured);
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
