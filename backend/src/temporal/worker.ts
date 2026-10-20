import 'dotenv/config';
import { Worker } from '@temporalio/worker';
import * as activities from './activities.js';
import { TASK_QUEUE, TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE } from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { isTemporalReachable } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let workerInstance: Worker | null = null;

export async function createOcrWorker(): Promise<Worker> {
  const workflowsPath = path.join(__dirname, 'workflows.ts');

  const worker = await Worker.create({
    workflowsPath,
    activities,
    taskQueue: TASK_QUEUE,
    namespace: TEMPORAL_NAMESPACE,
  });

  return worker;
}

export async function runWorker(): Promise<void> {
  const worker = await createOcrWorker();
  workerInstance = worker;
  console.log(`[Temporal Worker] Listening on task queue "${TASK_QUEUE}" (namespace: "${TEMPORAL_NAMESPACE}")`);
  await worker.run();
}

/**
 * Attempts to start the Temporal worker in the background if the Temporal server
 * is running and worker is not already active.
 */
export async function maybeStartWorker(): Promise<void> {
  if (workerInstance) return;
  const reachable = await isTemporalReachable(1000);
  if (!reachable) return;

  try {
    const worker = await createOcrWorker();
    workerInstance = worker;
    console.log(`[Temporal Worker] Auto-started in background on task queue "${TASK_QUEUE}"`);
    // Run worker in background without blocking server boot
    worker.run().catch((err) => {
      console.error('[Temporal Worker] Worker error:', err);
      workerInstance = null;
    });
  } catch (err) {
    console.warn('[Temporal Worker] Failed to auto-start worker:', (err as Error).message);
  }
}

// If executed directly (e.g. npm run temporal:worker)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  runWorker().catch((err) => {
    console.error('[Temporal Worker] Fatal error:', err);
    process.exit(1);
  });
}
