import type { BatchUploadResult } from '../services/uploadService';

export type TaskOwnerType = 'guest' | 'user';

export type OcrTask = {
  id: string;
  projectId: string; // Tracks which project this task belongs to
  ownerType: TaskOwnerType;
  userId?: string; // Present when ownerType === 'user'
  
  label?: string;
  documentCount: number;
  totalPages: number;
  documentsDone: number;
  expectedMs: number;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  message: string;
  failedDocuments: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
};

export type EnqueueOcrOptions = {
  projectId: string; // Required when adding a task
  selection: Array<{ pages: any[] }>;
  label?: string;
  onSettled?: (task: OcrTask, result: BatchUploadResult | void) => void;
};

export function isTaskActive(task: OcrTask): boolean {
  return task.status === 'queued' || task.status === 'processing';
}

/** Overall progress summary for a single project */
export type ProjectOcrProgress = {
  projectId: string;
  tasks: OcrTask[];
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  failedTasks: number;
  
  totalDocuments: number;
  documentsDone: number;
  failedDocuments: number;
  
  overallProgressPercent: number; // 0 to 100%
  isProcessing: boolean;
};