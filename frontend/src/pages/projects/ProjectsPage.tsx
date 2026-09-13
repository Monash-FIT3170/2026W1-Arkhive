import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, FolderOpen } from 'lucide-react';
import { createProject, listProjects, deleteProject } from '../../services/projectService';
import type { Project } from '../../models/Project';

/**
 * Projects list page — list/create/delete only.
 * Clicking into a project navigates to /projects/:id, handled by
 * ProjectWorkspacePage. This is intentionally minimal — styling/UX is a
 * placeholder.
 *
 * Guest access is blocked upstream by the RequireUser route guard (see
 * App.tsx) — this component can assume a real user is always present.
 */
export default function ProjectsPage() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newProjectName, setNewProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  async function handleCreate() {
    const name = newProjectName.trim();
    if (!name || isCreating) return;

    setIsCreating(true);
    setError(null);
    try {
      const project = await createProject(name);
      setProjects((prev) => [project, ...prev]);
      setNewProjectName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project.');
    } finally {
      setIsCreating(false);
    }
  }

  async function confirmDelete() {
    if (!deleteConfirmId || isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteProject(deleteConfirmId);
      setProjects((prev) => prev.filter((p) => p.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex-1 p-8 max-w-3xl mx-auto w-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>

      {error && <div className="alert alert-error text-sm">{error}</div>}

      {/* Create project */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="New project name"
          className="input input-bordered flex-1"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          disabled={isCreating}
        />
        <button
          className="btn btn-primary gap-1.5"
          onClick={handleCreate}
          disabled={isCreating || !newProjectName.trim()}
        >
          {isCreating ? (
            <span className="loading loading-spinner loading-sm" />
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Create
            </>
          )}
        </button>
      </div>

      {/* Project list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-base-content/50">
          No projects yet — create one above to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between rounded-lg border border-base-300 bg-base-200/40 px-4 py-3 hover:bg-base-200 transition-colors cursor-pointer"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen className="w-4 h-4 shrink-0 text-primary" />
                <span className="font-medium truncate">{project.name}</span>
                <span className="text-xs text-base-content/40 shrink-0">
                  {new Date(project.created_at).toLocaleDateString()}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-error"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmId(project.id);
                }}
                title="Delete project"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirmId && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Delete Project</h3>
            <p className="py-4 text-sm">
              This permanently deletes the project and all of its documents. This cannot be undone.
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button className="btn btn-error" onClick={confirmDelete} disabled={isDeleting}>
                {isDeleting ? <span className="loading loading-spinner loading-sm" /> : 'Delete'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDeleteConfirmId(null)} />
        </div>
      )}
    </div>
  );
}
