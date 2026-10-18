import { GoogleGenAI } from '@google/genai';

import { withRetry } from './utils/utils.js';
import { analyse_result } from './utils/analyseBuffer.js';
import { prepareForOCR } from '../ocrPreprocessor.js';
import { structureDocument } from './pipeline/pipeline.js';
import { getMockOcrResult } from './mockOcrFixture.js';
import type { DocType, StructuredDocument } from '../../models/Document.js';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface ParseOptions {
  docType?: DocType; // skip classification when known
  pageOffset?: number; // real 0-based page index of this image within its document
}

async function parseDocument(imageBuffer: Buffer, opts: ParseOptions): Promise<StructuredDocument> {
  // Skips Azure + Gemini entirely (no CI secrets, no flaky network). Fixture must be a StructuredDocument.
  if (process.env.OCR_MODE === 'mock') {
    return getMockOcrResult(opts.pageOffset ?? 0);
  }

  const preprocessed = await prepareForOCR(imageBuffer); // JIT sharpening + grayscale
  const azure = await analyse_result(preprocessed);
  return structureDocument(azure, { ai, docType: opts.docType, pageOffset: opts.pageOffset });
}

export function parseDocumentWithRetries(
  imageBuffer: Buffer,
  opts: ParseOptions = {},
  onRetry?: (attempt: number, maxRetries: number) => void
): Promise<StructuredDocument> {
  return withRetry(() => parseDocument(imageBuffer, opts), 1, 3000, onRetry);
}
