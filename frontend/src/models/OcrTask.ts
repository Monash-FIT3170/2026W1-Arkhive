// One entry in the OCR progress popup. A task is created each time the user
// presses "Process" on the preview page, so a task can cover several documents
// (and several pages per document).

export type OcrTaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface OcrTask {
  id: string;
  /** Short human-readable name, e.g. "invoice.pdf +2 more". */
  label: string;
  documentCount: number;
  totalPages: number;
  /** Documents the backend has finished (successfully or not) so far. This is the only real progress signal the backend sends. */
  documentsDone: number;
  status: OcrTaskStatus;
  /** Current step text shown under the progress bar. */
  message: string;
  error?: string;
  /** Documents (not pages) that failed OCR inside an otherwise finished task. */
  failedDocuments: number;
  /** How long we expect this task to take, used to draw the estimated progress bar. */
  expectedMs: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export function isTaskActive(task: OcrTask): boolean {
  return task.status === 'queued' || task.status === 'processing';
}