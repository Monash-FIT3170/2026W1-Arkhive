import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OcrProgressContext, type EnqueueOcrOptions } from './OcrProgressContext';
import { isTaskActive, type OcrTask, type ProjectOcrProgress } from '../models/OcrTask';
import { processDocuments, type BatchUploadResult } from '../services/uploadService';
import { unlockStep } from '../services/stepGuard';
import { estimateExpectedMs } from '../utils/ocrProgress';
import { processPages } from '../services/documentService';
import type { ProcessDocumentResponse } from '../models/Project';

type QueueEntry = EnqueueOcrOptions & {
  id: string;
  userId?: string;
  ownerType: 'guest' | 'user';
};

interface OcrProgressProviderProps {
  children: ReactNode;
  userId?: string | null;
}

export function OcrProgressProvider({ children, userId }: OcrProgressProviderProps) {
  const [allTasks, setAllTasks] = useState<OcrTask[]>([]);
  const [isMinimised, setMinimised] = useState(false);

  const tasksRef = useRef<OcrTask[]>([]);
  
  // Independent queue stores
  const userQueueRef = useRef<QueueEntry[]>([]);
  const guestQueueRef = useRef<QueueEntry[]>([]);

  // Independent execution locks for parallel processing
  const userRunningRef = useRef<{ id: string; controller: AbortController } | null>(null);
  const guestRunningRef = useRef<{ id: string; controller: AbortController } | null>(null);

  const counterRef = useRef(0);
  const learnedMsPerPageRef = useRef<number | null>(null);

  const commit = useCallback((next: OcrTask[]) => {
    tasksRef.current = next;
    setAllTasks(next);
  }, []);

  const visibleTasks = useMemo(() => {
    if (userId) {
      return allTasks.filter((t) => t.userId === userId);
    }
    return allTasks.filter((t) => t.ownerType === 'guest');
  }, [allTasks, userId]);

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

  const settle = useCallback(
    (entry: QueueEntry, result: ProcessDocumentResponse | BatchUploadResult | void) => {
      const task = tasksRef.current.find((t) => t.id === entry.id);
      if (task) entry.onSettled?.(task, result as any);
    },
    []
  );

  // Unified single-entry execution engine
  const processQueueEntry = useCallback(
    async (entry: QueueEntry, runningLock: React.MutableRefObject<{ id: string; controller: AbortController } | null>) => {
      const controller = new AbortController();
      runningLock.current = { id: entry.id, controller };

      patch(entry.id, (task) => ({
        status: 'processing',
        startedAt: Date.now(),
        expectedMs: estimateExpectedMs(task.totalPages, learnedMsPerPageRef.current),
        message: 'Starting OCR…',
      }));

      let result: ProcessDocumentResponse | BatchUploadResult | void = undefined;
      try {
        if (entry.projectId) {
          result = await processPages(entry.selection as any);
        } else {
          result = await processDocuments(entry.selection as any);
        }

        const jobs = (result && 'jobs' in result && Array.isArray(result.jobs)) ? result.jobs : [];
        const failedFromJobs = jobs.filter((job) => job.status === 'failed');
        const current = tasksRef.current.find((t) => t.id === entry.id);
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
      } finally {
        settle(entry, result);
        runningLock.current = null;
      }
    },
    [patch, settle]
  );

  // Worker for Logged-In User Queue
  const pumpUser = useCallback(async () => {
    if (userRunningRef.current) return;
    while (userQueueRef.current.length > 0) {
      const entry = userQueueRef.current.shift();
      if (entry) await processQueueEntry(entry, userRunningRef);
    }
  }, [processQueueEntry]);

  // Worker for Guest Queue
  const pumpGuest = useCallback(async () => {
    if (guestRunningRef.current) return;
    while (guestQueueRef.current.length > 0) {
      const entry = guestQueueRef.current.shift();
      if (entry) await processQueueEntry(entry, guestRunningRef);
    }
  }, [processQueueEntry]);

  // Dual Enqueue mechanism
  const enqueue = useCallback(
    (options: EnqueueOcrOptions) => {
      const id = `ocr-task-${Date.now()}-${counterRef.current++}`;
      const ownerType: 'user' | 'guest' = userId ? 'user' : 'guest';

      const task: OcrTask = {
        id,
        projectId: options.projectId ?? '',
        ownerType,
        userId: userId ?? undefined,
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

      const queueEntry: QueueEntry = { ...options, id, userId: userId ?? undefined, ownerType };

      if (ownerType === 'user') {
        userQueueRef.current.push(queueEntry);
        setMinimised(false);
        void pumpUser();
      } else {
        guestQueueRef.current.push(queueEntry);
        setMinimised(false);
        void pumpGuest();
      }

      return id;
    },
    [commit, pumpUser, pumpGuest, userId]
  );

  const cancelTask = useCallback(
    (id: string) => {
      let queuedIndex = userQueueRef.current.findIndex((entry) => entry.id === id);
      if (queuedIndex !== -1) {
        const [entry] = userQueueRef.current.splice(queuedIndex, 1);
        patch(id, { status: 'cancelled', message: 'Cancelled', finishedAt: Date.now() });
        settle(entry, undefined);
        return;
      }

      queuedIndex = guestQueueRef.current.findIndex((entry) => entry.id === id);
      if (queuedIndex !== -1) {
        const [entry] = guestQueueRef.current.splice(queuedIndex, 1);
        patch(id, { status: 'cancelled', message: 'Cancelled', finishedAt: Date.now() });
        settle(entry, undefined);
        return;
      }

      if (userRunningRef.current?.id === id) {
        userRunningRef.current.controller.abort();
      } else if (guestRunningRef.current?.id === id) {
        guestRunningRef.current.controller.abort();
      }
    },
    [patch, settle]
  );

  const cancelAll = useCallback(() => {
    tasksRef.current.filter(isTaskActive).forEach((task) => cancelTask(task.id));
  }, [cancelTask]);

  const cancelProjectTasks = useCallback(
    (projectId: string) => {
      tasksRef.current
        .filter((task) => task.projectId === projectId && isTaskActive(task))
        .forEach((task) => cancelTask(task.id));
    },
    [cancelTask]
  );

  const clearFinished = useCallback(() => {
    commit(tasksRef.current.filter(isTaskActive));
  }, [commit]);

  const getProjectProgress = useCallback(
    (projectId?: string): ProjectOcrProgress => {
      if (!projectId) {
        return {
          projectId: '',
          tasks: [],
          totalTasks: 0,
          completedTasks: 0,
          activeTasks: 0,
          failedTasks: 0,
          totalDocuments: 0,
          documentsDone: 0,
          failedDocuments: 0,
          overallProgressPercent: 0,
          isProcessing: false,
        };
      }

      const projectTasks = visibleTasks.filter(
        (t) => t.projectId && String(t.projectId) === String(projectId)
      );

      const totalDocuments = projectTasks.reduce((sum, t) => sum + t.documentCount, 0);
      const documentsDone = projectTasks.reduce((sum, t) => sum + t.documentsDone, 0);
      const failedDocuments = projectTasks.reduce((sum, t) => sum + t.failedDocuments, 0);

      const completedTasks = projectTasks.filter((t) => t.status === 'completed').length;
      const failedTasks = projectTasks.filter((t) => t.status === 'failed').length;
      const activeTasks = projectTasks.filter(
        (t) => t.status === 'processing' || t.status === 'queued'
      ).length;

      const overallProgressPercent =
        totalDocuments > 0 ? Math.round((documentsDone / totalDocuments) * 100) : 0;

      return {
        projectId,
        tasks: projectTasks,
        totalTasks: projectTasks.length,
        completedTasks,
        activeTasks,
        failedTasks,
        totalDocuments,
        documentsDone,
        failedDocuments,
        overallProgressPercent,
        isProcessing: activeTasks > 0,
      };
    },
    [visibleTasks]
  );

  const value = useMemo(
    () => ({
      allTasks, // exposed so popups can filter by ownerType explicitly
      tasks: visibleTasks,
      isMinimised,
      setMinimised,
      enqueue,
      cancelTask,
      cancelAll,
      cancelProjectTasks,
      clearFinished,
      getProjectProgress,
    }),
    [
      allTasks,
      visibleTasks,
      isMinimised,
      enqueue,
      cancelTask,
      cancelAll,
      cancelProjectTasks,
      clearFinished,
      getProjectProgress,
    ]
  );

  return <OcrProgressContext.Provider value={value}>{children}</OcrProgressContext.Provider>;
}