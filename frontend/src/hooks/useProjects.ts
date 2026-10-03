import { useCallback, useEffect, useState } from 'react';
import {
  createProject,
  listProjects,
  updateProject,
  deleteProject,
} from '../services/projectService';
import type { Project } from '../models/Project';

/**
 * Owns the projects list plus the create/rename/delete API calls and how
 * they update local state. Presentational components stay unaware of
 * projectService entirely — they just call the functions this returns.
 */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    listProjects()
      .then((data) => {
        if (isMounted) setProjects(data);
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load projects.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const create = useCallback(async (name: string): Promise<Project> => {
    const project = await createProject(name);
    setProjects((prev) => [project, ...prev]);
    return project;
  }, []);

  const rename = useCallback(async (id: string, name: string): Promise<Project> => {
    const updated = await updateProject(id, name);
    setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    return updated;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, isLoading, error, setError, create, rename, remove };
}
