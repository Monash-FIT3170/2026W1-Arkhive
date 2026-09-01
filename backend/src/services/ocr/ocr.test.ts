// This test file was generated with the assistance of Google Gemini.

// Mocks the Google Cloud Vision API and checks for issues with our own logic
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as ocr from './ocr';

// Mock fs to prevent top-level execution from crashing during import
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue(Buffer.from('dummy')),
    writeFileSync: vi.fn(),
  }
}));

// Mock Azure table extraction
const { mockAnalyseResult } = vi.hoisted(() => ({
  mockAnalyseResult: vi.fn().mockResolvedValue([]),
}));

vi.mock('./utils/utils_table_extraction_new.js', () => ({
  analyse_result: mockAnalyseResult,
}));

// Mock Google Cloud Vision
const { mockDocumentTextDetection } = vi.hoisted(() => ({
  mockDocumentTextDetection: vi.fn().mockResolvedValue([{
    fullTextAnnotation: {
      pages: []
    }
  }]),
}));

vi.mock('@google-cloud/vision', () => {
  return {
    default: {
      ImageAnnotatorClient: class {
        documentTextDetection = mockDocumentTextDetection
      }
    }
  };
});

describe('ocr service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('textExtraction', () => {
    it('should extract text successfully', async () => {
      mockDocumentTextDetection.mockResolvedValueOnce([{
        fullTextAnnotation: { text: 'Extracted sample text' }
      }]);
      
      const buffer = Buffer.from('test-image-data');
      const result = await ocr.textExtraction(buffer);
      
      expect(result).toBe('Extracted sample text');
      expect(mockDocumentTextDetection).toHaveBeenCalledWith({
        image: { content: buffer }
      });
    });

    it('should handle empty text results gracefully', async () => {
      mockDocumentTextDetection.mockResolvedValueOnce([{
        fullTextAnnotation: null
      }]);
      
      const result = await ocr.textExtraction(Buffer.from('test'));
      expect(result).toBe('');
    });
  });

  describe('parseTableWithRetries', () => {
    it('should call parseTable (with retries on failure)', async () => {
      await ocr.parseTableWithRetries(Buffer.from('test'));
      expect(mockAnalyseResult).toHaveBeenCalled();
    });
  });
});

