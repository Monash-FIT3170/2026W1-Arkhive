import { createContext, useContext } from 'react';
import type { OcrTask, EnqueueOcrOptions, ProjectOcrProgress } from '../models/OcrTask';

export interface OcrProgressContextValue {
  tasks: OcrTask[];
  isMinimised: boolean;
  setMinimised: (minimised: boolean) => void;
  enqueue: (options: EnqueueOcrOptions) => string;
  cancelTask: (id: string) => void;
  cancelAll: () => void;
  cancelProjectTasks: (projectId: string) => void;
  clearFinished: () => void;
  
  // Project-level helpers
  getProjectProgress: (projectId?: string) => ProjectOcrProgress;
}

export const OcrProgressContext = createContext<OcrProgressContextValue | null>(null);

// In OcrProgressProvider.tsx:
export function useOcrProgress(scopedProjectId?: string) {
  const context = useContext(OcrProgressContext);
  if (!context) {
    throw new Error('useOcrProgress must be used within an OcrProgressProvider');
  }

  // If scopedProjectId is provided, return context with filtered tasks
  if (scopedProjectId) {
    return {
      ...context,
      tasks: context.tasks.filter(
        (task) => String(task.projectId) === String(scopedProjectId)
      ),
    };
  }

  return context;
}