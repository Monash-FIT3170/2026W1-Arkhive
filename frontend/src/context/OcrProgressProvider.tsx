import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { OcrProgressContext, type EnqueueOcrOptions } from './OcrProgressContext';
import { isTaskActive, type OcrTask } from '../models/OcrTask';
import type { BatchProgressEvent } from '../models/Job';
import { processDocuments, type BatchUploadResult } from '../services/uploadService';
import { unlockStep } from '../services/stepGuard';
import { estimateExpectedMs } from '../utils/ocrProgress';

type QueueEntry = EnqueueOcrOptions & { id: string };

/**
 * Owns the OCR queue for the whole app (it lives above the router), so progress
 * keeps updating when the user leaves the preview page.
 *
 * Tasks run one at a time. The backend stores a session's jobs/extraction in a
 * single slot that each batch overwrites, so running two batches at once would
 * make them clobber each other's results. Running them in order keeps every
 * batch's results intact while still letting the user queue more work.
 */
export function OcrProgressProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<OcrTask[]>([]);
  const [isMinimised, setMinimised] = useState(false);

  // tasksRef is the source of truth so event handlers never read stale state.
  const tasksRef = useRef<OcrTask[]>([]);
  const queueRef = useRef<QueueEntry[]>([]);
  const runningRef = useRef<{ id: string; controller: AbortController } | null>(null);
  const counterRef = useRef(0);
  // Measured ms-per-page from finished tasks, so later estimates get closer to reality.
  const learnedMsPerPageRef = useRef<number | null>(null);

  const commit = useCallback((next: OcrTask[]) => {
    tasksRef.current = next;
    setTasks(next);
  }, []);

  const patch = useCallback(
    (id: string, update: Partial<OcrTask> | ((task: OcrTask) => Partial<OcrTask>)) => {
      commit(
        tasksRef.current.map((task) =>
          task.id === id
            ? { ...task, ...(typeof update === 'function' ? update(task) : update) }
            : task
        )
      );
    },
    [commit]
  );

  const applyEvent = useCallback(
    (id: string, event: BatchProgressEvent) => {
      switch (event.type) {
        case 'job_progress':
          patch(id, { message: `Reading ${event.fileName ?? 'document'}…` });
          break;
        case 'retry':
          patch(id, {
            message: `Retrying (attempt ${event.attempt} of ${event.maxRetries}) — ${event.fileName ?? 'document'}`,
          });
          break;
        case 'job_completed':
          patch(id, (task) => {
            const documentsDone = Math.min(task.documentsDone + 1, task.documentCount);
            return {
              documentsDone,
              message: `${documentsDone} of ${task.documentCount} ${task.documentCount === 1 ? 'document' : 'documents'} finished`,
            };
          });
          break;
        case 'job_failed':
          patch(id, (task) => ({
            documentsDone: Math.min(task.documentsDone + 1, task.documentCount),
            failedDocuments: task.failedDocuments + 1,
            message: `Could not read ${event.fileName ?? 'a document'}`,
          }));
          break;
        default:
          break;
      }
    },
    [patch]
  );

  const settle = useCallback(
    (entry: QueueEntry, result: BatchUploadResult | void) => {
      const task = tasksRef.current.find((t) => t.id === entry.id);
      if (task) entry.onSettled?.(task, result);
    },
    []
  );

  // Runs queued tasks one after another. A plain loop (rather than the function
  // calling itself) keeps exactly one task in flight even if onSettled enqueues more work.
  const pump = useCallback(async () => {
    if (runningRef.current) return;

    let entry: QueueEntry | undefined;
    while ((entry = queueRef.current.shift())) {
      const controller = new AbortController();
      runningRef.current = { id: entry.id, controller };
      patch(entry.id, (task) => ({
        status: 'processing',
        startedAt: Date.now(),
        expectedMs: estimateExpectedMs(task.totalPages, learnedMsPerPageRef.current),
        message: 'Starting OCR…',
      }));

      let result: BatchUploadResult | void = undefined;
      try {
        result = await processDocuments(
          entry.selection,
          undefined,
          (event) => applyEvent(entry!.id, event),
          controller.signal
        );

        const jobs = result?.jobs ?? [];
        const failedFromJobs = jobs.filter((job) => job.status === 'failed');
        const current = tasksRef.current.find((t) => t.id === entry!.id);
        const failedDocuments = jobs.length > 0 ? failedFromJobs.length : (current?.failedDocuments ?? 0);
        const allFailed = current !== undefined && failedDocuments >= current.documentCount;

        if (allFailed) {
          patch(entry.id, {
            status: 'failed',
            failedDocuments,
            error: failedFromJobs[0]?.errorMessage ?? 'OCR failed for every selected document.',
            message: 'OCR failed',
            finishedAt: Date.now(),
          });
        } else {
          unlockStep(2);
          if (current?.startedAt && failedDocuments === 0 && current.totalPages > 0) {
            const measured = (Date.now() - current.startedAt) / current.totalPages;
            const previous = learnedMsPerPageRef.current;
            learnedMsPerPageRef.current = previous === null ? measured : (previous + measured) / 2;
          }
          patch(entry.id, (task) => ({
            status: 'completed',
            documentsDone: task.documentCount,
            failedDocuments,
            message:
              failedDocuments > 0
                ? `${failedDocuments} of ${task.documentCount} documents failed`
                : 'Completed',
            finishedAt: Date.now(),
          }));
        }
      } catch (err) {
        if (controller.signal.aborted) {
          patch(entry.id, { status: 'cancelled', message: 'Cancelled', finishedAt: Date.now() });
        } else {
          const message =
            err instanceof Error ? err.message : 'An unexpected error occurred during processing.';
          patch(entry.id, { status: 'failed', error: message, message: 'OCR failed', finishedAt: Date.now() });
          console.error('Processing failed:', err);
        }
      }

      try {
        settle(entry, result);
      } finally {
        runningRef.current = null;
      }
    }
  }, [applyEvent, patch, settle]);

  const enqueue = useCallback(
    (options: EnqueueOcrOptions) => {
      const id = `ocr-task-${Date.now()}-${counterRef.current++}`;
      const task: OcrTask = {
        id,
        label: options.label,
        documentCount: options.selection.length,
        totalPages: options.selection.reduce((sum, doc) => sum + doc.pages.length, 0),
        documentsDone: 0,
        expectedMs: estimateExpectedMs(
          options.selection.reduce((sum, doc) => sum + doc.pages.length, 0),
          learnedMsPerPageRef.current
        ),
        status: 'queued',
        message: 'Waiting in queue',
        failedDocuments: 0,
        createdAt: Date.now(),
      };
      commit([...tasksRef.current, task]);
      queueRef.current.push({ ...options, id });
      setMinimised(false); // pop the window open whenever new work starts
      void pump();
      return id;
    },
    [commit, pump]
  );

  const cancelTask = useCallback(
    (id: string) => {
      const queuedIndex = queueRef.current.findIndex((entry) => entry.id === id);
      if (queuedIndex !== -1) {
        const [entry] = queueRef.current.splice(queuedIndex, 1);
        patch(id, { status: 'cancelled', message: 'Cancelled', finishedAt: Date.now() });
        settle(entry, undefined);
        return;
      }
      if (runningRef.current?.id === id) {
        runningRef.current.controller.abort();
      }
    },
    [patch, settle]
  );

  const cancelAll = useCallback(() => {
    tasksRef.current.filter(isTaskActive).forEach((task) => cancelTask(task.id));
  }, [cancelTask]);

  const clearFinished = useCallback(() => {
    commit(tasksRef.current.filter(isTaskActive));
  }, [commit]);

  const value = useMemo(
    () => ({ tasks, isMinimised, setMinimised, enqueue, cancelTask, cancelAll, clearFinished }),
    [tasks, isMinimised, enqueue, cancelTask, cancelAll, clearFinished]
  );

  return <OcrProgressContext.Provider value={value}>{children}</OcrProgressContext.Provider>;
}