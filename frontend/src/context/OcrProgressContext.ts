import { createContext, useContext } from 'react';
import type { OcrTask, EnqueueOcrOptions, ProjectOcrProgress } from '../models/OcrTask';

export interface OcrProgressContextValue {
  tasks: OcrTask[];
  allTasks?: OcrTask[];
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

export function useOcrProgress(scopedProjectId?: string): OcrProgressContextValue {
  const context = useContext(OcrProgressContext);
  if (!context) {
    throw new Error('useOcrProgress must be used within an OcrProgressProvider');
  }

  // Preserve unfiltered tasks on context for global popups
  const baseValue: OcrProgressContextValue = {
    ...context,
    allTasks: context.tasks,
  };

  // If scopedProjectId is provided, safely filter tasks for that project
  if (
    scopedProjectId !== undefined &&
    scopedProjectId !== null &&
    String(scopedProjectId).trim() !== ''
  ) {
    return {
      ...baseValue,
      tasks: context.tasks.filter(
        (task) =>
          task.projectId !== undefined &&
          task.projectId !== null &&
          String(task.projectId) === String(scopedProjectId)
      ),
    };
  }

  return baseValue;
}