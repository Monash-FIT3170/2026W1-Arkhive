import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected,
  type DocumentIntelligenceClient,
  type AnalyzeOperationOutput,
  type AnalyzeResultOutput,
} from '@azure-rest/ai-document-intelligence';

const endpoint = process.env.endpoint!;
const key = process.env.AZURE_CLOUD_API_KEY!;

const client: DocumentIntelligenceClient = DocumentIntelligence(
  endpoint,
  { key: key },
  { apiVersion: '2024-11-30' }
);

/** Azure layout only. Structuring now lives in pipeline/. */
export async function analyse_result(buffer: Buffer): Promise<AnalyzeResultOutput> {
  const request = await client.path('/documentModels/{modelId}:analyze', 'prebuilt-layout').post({
    contentType: 'application/octet-stream',
    body: buffer,
    queryParameters: { outputContentFormat: 'markdown' },
  });

  if (isUnexpected(request)) throw request.body.error;

  const poller = getLongRunningPoller(client, request);
  const response = await poller.pollUntilDone();

  const result = (response.body as AnalyzeOperationOutput).analyzeResult;
  if (!result?.pages?.some((p) => p.lines?.length)) {
    // your controller already special-cases this prefix
    throw new Error('NoTextDetectedError: No text detected in this page.');
  }
  return result;
}
