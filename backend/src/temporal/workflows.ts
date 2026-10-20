import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities.js';

const {
  preprocessImageActivity,
  azureAnalyzeLayoutActivity,
  geminiStructureAndHydrateActivity,
  mockOcrActivity,
  cleanupTempFilesActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '3 minutes',
  retry: {
    initialInterval: '2s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['NoTextDetectedError'],
  },
});

export interface OcrWorkflowInput {
  documentId?: string;
  pageIndex?: string;
  fileName?: string;
  filePath?: string;
  tempInputPath?: string;
  bufferBase64?: string;
  isMock?: boolean;
}

/**
 * Orchestrates the OCR pipeline as a durable Temporal workflow.
 * Shows each step, timing, and retries in the Temporal Web UI.
 */
export async function ocrWorkflow(input: OcrWorkflowInput): Promise<any> {
  if (input.isMock) {
    return await mockOcrActivity();
  }

  let preprocessedFilePath: string | undefined;

  try {
    // Step 1: Preprocess image with OpenCV / Sharp
    const preprocessRes = await preprocessImageActivity({
      filePath: input.filePath,
      tempInputPath: input.tempInputPath,
      bufferBase64: input.bufferBase64,
    });
    preprocessedFilePath = preprocessRes.preprocessedFilePath;

    // Step 2: Extract raw layout via Azure Document Intelligence
    const azureResult = await azureAnalyzeLayoutActivity({
      preprocessedFilePath,
    });

    // Step 3: LLM structure extraction with Gemini Flash Lite & component hydration
    const finalComponents = await geminiStructureAndHydrateActivity({
      azureResult,
    });

    return finalComponents;
  } finally {
    // Step 4: Cleanup intermediate files
    const toClean = [preprocessedFilePath, input.tempInputPath].filter(
      (p): p is string => Boolean(p)
    );
    if (toClean.length > 0) {
      await cleanupTempFilesActivity({ filePaths: toClean });
    }
  }
}
