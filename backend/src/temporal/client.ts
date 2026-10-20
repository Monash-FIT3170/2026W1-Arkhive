import { Connection, Client } from '@temporalio/client';
import { TASK_QUEUE, TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE } from './config.js';
import { ocrWorkflow, OcrWorkflowInput } from './workflows.js';

let clientPromise: Promise<Client> | null = null;
let temporalAvailable: boolean | null = null;

/**
 * Checks if the Temporal Server is reachable.
 */
export async function isTemporalReachable(timeoutMs = 1500): Promise<boolean> {
  if (process.env.TEMPORAL_ENABLED === 'false') {
    return false;
  }
  if (temporalAvailable !== null) {
    return temporalAvailable;
  }

  try {
    const connectionPromise = Connection.connect({
      address: TEMPORAL_ADDRESS,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Temporal connection timed out')), timeoutMs)
    );

    const connection = await Promise.race([connectionPromise, timeoutPromise]);
    await connection.healthService.check({});
    temporalAvailable = true;
    return true;
  } catch (err) {
    console.warn(`[Temporal] Server not reachable at ${TEMPORAL_ADDRESS} (${(err as Error).message}). Falling back to direct execution.`);
    temporalAvailable = false;
    return false;
  }
}

/**
 * Retrieves the singleton Temporal client.
 */
export async function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const connection = await Connection.connect({
        address: TEMPORAL_ADDRESS,
      });
      return new Client({
        connection,
        namespace: TEMPORAL_NAMESPACE,
      });
    })();
  }
  return await clientPromise;
}

/**
 * Dispatches the OCR pipeline through Temporal for durable execution,
 * function timing, and step-by-step visibility in the Temporal Web UI.
 */
export async function executeOcrWorkflow(input: OcrWorkflowInput): Promise<any> {
  const client = await getTemporalClient();

  const safeName = (input.fileName || input.documentId || 'job')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const workflowId = `ocr-${safeName}-p${input.pageIndex ?? '0'}-${Date.now()}`;

  return await client.workflow.execute(ocrWorkflow, {
    taskQueue: TASK_QUEUE,
    workflowId,
    args: [input],
  });
}
