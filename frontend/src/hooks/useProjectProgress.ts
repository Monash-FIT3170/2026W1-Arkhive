// hooks/useProjectProgress.ts
import { useOcrProgress } from '../context/OcrProgressContext';

export function useProjectProgress(projectId: string) {
  const { getProjectProgress, cancelProjectTasks } = useOcrProgress();
  const progress = getProjectProgress(projectId);

  return {
    ...progress,
    cancelProject: () => cancelProjectTasks(projectId),
  };
}