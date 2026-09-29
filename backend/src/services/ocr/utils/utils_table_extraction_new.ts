import DocumentIntelligence, {
} from '@azure-rest/ai-document-intelligence';
import {
  getLongRunningPoller,
  isUnexpected,
  type DocumentIntelligenceClient,
  type AnalyzeOperationOutput,
} from '@azure-rest/ai-document-intelligence';
import fs from 'fs';
import {
  geminiSchemaBBoxPrompt,
  geminiSchemaBBoxPromptSimplified,
} from '../types/boundingBoxTypes';
import { mapOCRtoPages } from './experimental';
import { PDFDocument } from 'pdf-lib';
import { time } from 'console';

//const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const endpoint = process.env.endpoint!;
const key = process.env.AZURE_CLOUD_API_KEY!;
const ARBITRARY_MAX_PAGES = 6;

const client: DocumentIntelligenceClient = DocumentIntelligence(
  endpoint,
  { key: key },
  { apiVersion: '2024-11-30' }
);

export async function analyse_result(buffer: Buffer) {
  const request = await client.path('/documentModels/{modelId}:analyze', 'prebuilt-layout').post({
    contentType: 'application/octet-stream',
    body: buffer,
    queryParameters: {
    outputContentFormat: 'markdown',
  },
  });

  if (isUnexpected(request)) {
    throw request.body.error;
  }

  const poller = getLongRunningPoller(client, request);
  const response = await poller.pollUntilDone();

  const result = response.body as AnalyzeOperationOutput;
  const markdownContent = result.analyzeResult?.content ?? "";
  const start = performance.now();
  const tester = await mapOCRtoPages(geminiSchemaBBoxPromptSimplified);
  const end = performance.now();
  fs.writeFileSync("speed.txt", `${(end-start).toFixed(2)}`)
  //const defaultOutputFunc = await mapTablesToOCRComponents(geminiSchemaBBoxPrompt);
  //const processedOut = await defaultOutputFunc(result);
  const output = await tester(result);
  return output;
}

export async function analyse_result1(buffer: Buffer) {
  const request = await client.path('/documentModels/{modelId}:analyze', 'prebuilt-layout').post({
    contentType: 'application/octet-stream',
    body: buffer,
    queryParameters: {
    outputContentFormat: 'markdown',
  },
  });

  if (isUnexpected(request)) {
    throw request.body.error;
  }

  const poller = getLongRunningPoller(client, request);
  const response = await poller.pollUntilDone();

  const result = response.body as AnalyzeOperationOutput;
  const markdownContent = result.analyzeResult?.content ?? "";
  const start = performance.now();
  const tester = await mapOCRtoPages(geminiSchemaBBoxPromptSimplified);
  const end = performance.now();
  fs.writeFileSync("speed.txt", `${(end-start).toFixed(2)}`)
  //const defaultOutputFunc = await mapTablesToOCRComponents(geminiSchemaBBoxPrompt);
  //const processedOut = await defaultOutputFunc(result);
  const output = await tester(result);
  return output;
}
