import { createContext, useContext } from 'react';
import type { BatchUploadResult } from '../services/uploadService';
import type { OcrTask } from '../models/OcrTask';

export interface EnqueueOcrOptions {
  /** Same shape processDocuments() expects: pages are backend page indices as strings. */
  selection: { documentId: string; pages: string[] }[];
  label: string;
  /** Called once when the task finishes, fails or is cancelled. Not called if the task never settles. */
  onSettled?: (task: OcrTask, result: BatchUploadResult | void) => void;
}

export interface OcrProgressContextType {
  projectID?: string;
  tasks: OcrTask[];
  isMinimised: boolean;
  setMinimised: (minimised: boolean) => void;
  /** Adds a task to the queue and starts it as soon as earlier tasks have finished. Returns the task id. */
  enqueue: (options: EnqueueOcrOptions) => string;
  cancelTask: (id: string) => void;
  cancelAll: () => void;
  /** Removes completed / failed / cancelled tasks from the list. */
  clearFinished: () => void;
}

export const OcrProgressContext = createContext<OcrProgressContextType | undefined>(undefined);

export const useOcrProgress = (): OcrProgressContextType => {
  const context = useContext(OcrProgressContext);
  if (!context) {
    throw new Error('useOcrProgress must be used within an OcrProgressProvider');
  }
  return context;
};