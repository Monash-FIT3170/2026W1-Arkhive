import path from 'path';
import vision from '@google-cloud/vision';
import fs from 'fs';

import { withRetry } from './utils/utils.js';
import { analyse_result } from './utils/utils_table_extraction_new.js';
import { getMockOcrResult } from './mockOcrFixture.js';
import { prepareForOCR } from '../ocrPreprocessor.js';

const sampleImage = 'assets/sample-page-1.png';



/**
 * @author Aryan Cyrus (33114242)
 * Initializes the Google Cloud Vision client with the necessary credentials.
 *
 * We are when deploying one needs to add env variables to hosting platform BUT:
 * - Render does not take JSON env variables, so we need to
 *   convert the JSON to base64 and then decode it back to JSON in the code.
 *
 * So all render sees is: GOOGLE_CREDENTIALS_BASE64 = <base64 encoded JSON>
 */
const localCredsPath = path.resolve(
  process.cwd(),
  '../backend/src/credentials/google-vision-key.json'
);
const tempCredsPath = path.join('/tmp', 'google-vision-key.json');

let credsPath: string;

if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  // Render (or any host with the base64 env var set): decode to /tmp
  fs.writeFileSync(tempCredsPath, Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64'));
  credsPath = tempCredsPath;
} else {
  // Local dev: use the JSON file already sitting in the repo
  credsPath = localCredsPath;
}

const client = new vision.ImageAnnotatorClient({
  keyFilename: credsPath,
  features: [
    {
      type: 'DOCUMENT_TEXT_DETECTION',
    },
  ],
  imageContext: {
    languageHints: ['en'],
  },
});

/**
 *
 * THIS NEEDS TO BE REWORKED
 */
export async function textExtraction(buffer: Buffer): Promise<string> {
  const [result] = await client.documentTextDetection({
    image: { content: buffer },
  });
  return result.fullTextAnnotation?.text ?? '';
}

//test ocr on 1 png page
export async function testOCR() {
  const sampleImagePath = path.resolve(process.cwd(), sampleImage);
  const imageBuffer = fs.readFileSync(sampleImagePath);
  const text = await textExtraction(imageBuffer);

  return {
    success: true,
    text
  };
}



/** 
 @author Harsha Sharma (33879303)
*/
async function parseTable(imageBuffer: Buffer) {
  // Skips the real Azure Document Intelligence + Gemini calls entirely.
  // See mockOcrFixture.ts for why: no CI/test secrets, no flaky network dependency.
  if (process.env.OCR_MODE === 'mock') {
    return getMockOcrResult();
  }
  
  // Phase 4: JIT OCR Enhancement (sharpening + grayscale)
  const preprocessedBuffer = await prepareForOCR(imageBuffer);
  
  return analyse_result(preprocessedBuffer);
}

import { isTemporalReachable, executeOcrWorkflow } from '../../temporal/client.js';
import { randomUUID } from 'crypto';

export interface OcrExecutionOptions {
  documentId?: string;
  pageIndex?: string;
  fileName?: string;
  filePath?: string;
  onRetry?: (attempt: number, maxRetries: number) => void;
}

/*
 @author Harsha Sharma (33879303)
*/
export async function parseTableWithRetries(
  imageBuffer: Buffer,
  optionsOrOnRetry?:
    | ((attempt: number, maxRetries: number) => void)
    | OcrExecutionOptions
) {
  const onRetry =
    typeof optionsOrOnRetry === 'function'
      ? optionsOrOnRetry
      : optionsOrOnRetry?.onRetry;

  const options: OcrExecutionOptions =
    typeof optionsOrOnRetry === 'object' && optionsOrOnRetry !== null
      ? optionsOrOnRetry
      : {};

  // Check if Temporal is available for durable workflow orchestration & timing visualization
  const useTemporal = await isTemporalReachable(1000);
  if (useTemporal) {
    let tempInputPath: string | undefined;
    if (!options.filePath) {
      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      tempInputPath = path.join(tempDir, `ocr-input-${Date.now()}-${randomUUID()}.png`);
      fs.writeFileSync(tempInputPath, imageBuffer);
    }

    try {
      return await executeOcrWorkflow({
        documentId: options.documentId,
        pageIndex: options.pageIndex,
        fileName: options.fileName,
        filePath: options.filePath,
        tempInputPath,
        isMock: process.env.OCR_MODE === 'mock',
      });
    } catch (temporalError) {
      console.warn(
        '[Temporal] Workflow execution failed, falling back to direct execution:',
        temporalError
      );
    } finally {
      if (tempInputPath && fs.existsSync(tempInputPath)) {
        try {
          fs.unlinkSync(tempInputPath);
        } catch {
          // ignore
        }
      }
    }
  }

  // In-process fallback
  return await withRetry(() => parseTable(imageBuffer), 1, 3000, onRetry);
}


