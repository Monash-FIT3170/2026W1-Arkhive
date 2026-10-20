import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import { prepareForOCR } from '../services/ocrPreprocessor.js';
import {
  analyzeAzureLayout,
  mapAzureResultToPages,
} from '../services/ocr/utils/utils_table_extraction_new.js';
import { getMockOcrResult } from '../services/ocr/mockOcrFixture.js';

export interface PreprocessInput {
  filePath?: string;
  tempInputPath?: string;
  bufferBase64?: string;
}

export interface PreprocessOutput {
  preprocessedFilePath: string;
}

export interface AzureAnalyzeInput {
  preprocessedFilePath: string;
}

export interface GeminiStructureInput {
  azureResult: any;
}

export interface CleanupInput {
  filePaths: string[];
}

function getTempDir(): string {
  const uploadsTemp = path.join(process.cwd(), 'uploads', 'temp');
  if (!fs.existsSync(uploadsTemp)) {
    fs.mkdirSync(uploadsTemp, { recursive: true });
  }
  return uploadsTemp;
}

/**
 * Activity 1: Image Preprocessing with OpenCV / Sharp
 */
export async function preprocessImageActivity(
  input: PreprocessInput
): Promise<PreprocessOutput> {
  let imageBuffer: Buffer;

  if (input.filePath && fs.existsSync(input.filePath)) {
    imageBuffer = fs.readFileSync(input.filePath);
  } else if (input.tempInputPath && fs.existsSync(input.tempInputPath)) {
    imageBuffer = fs.readFileSync(input.tempInputPath);
  } else if (input.bufferBase64) {
    imageBuffer = Buffer.from(input.bufferBase64, 'base64');
  } else {
    throw new Error('No valid image source provided for preprocessing.');
  }

  const preprocessedBuffer = await prepareForOCR(imageBuffer);

  const tempFileName = `ocr-preprocessed-${Date.now()}-${randomUUID()}.png`;
  const preprocessedFilePath = path.join(getTempDir(), tempFileName);
  fs.writeFileSync(preprocessedFilePath, preprocessedBuffer);

  return { preprocessedFilePath };
}

/**
 * Activity 2: Azure Document Intelligence Layout Analysis
 */
export async function azureAnalyzeLayoutActivity(
  input: AzureAnalyzeInput
): Promise<any> {
  if (!fs.existsSync(input.preprocessedFilePath)) {
    throw new Error(`Preprocessed file not found: ${input.preprocessedFilePath}`);
  }

  const buffer = fs.readFileSync(input.preprocessedFilePath);
  return await analyzeAzureLayout(buffer);
}

/**
 * Activity 3: Gemini Flash Lite Structure Mapping and Hydration
 */
export async function geminiStructureAndHydrateActivity(
  input: GeminiStructureInput
): Promise<any> {
  return await mapAzureResultToPages(input.azureResult);
}

/**
 * Activity 4: Mock OCR for testing without external services
 */
export async function mockOcrActivity(): Promise<any> {
  return await getMockOcrResult();
}

/**
 * Activity 5: Clean up temporary files created during workflow
 */
export async function cleanupTempFilesActivity(
  input: CleanupInput
): Promise<{ cleaned: number }> {
  let cleaned = 0;
  for (const filePath of input.filePaths) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        cleaned++;
      } catch (err) {
        console.warn(`Failed to cleanup temp file: ${filePath}`, err);
      }
    }
  }
  return { cleaned };
}
