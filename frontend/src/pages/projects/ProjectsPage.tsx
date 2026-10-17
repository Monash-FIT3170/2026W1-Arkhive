import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, FolderOpen } from 'lucide-react';
import { useProjects } from '../../hooks/useProjects';
import { useProjectPreview } from '../../hooks/useProjectPreview';
import CreateProjectForm from './components/CreateProjectForm';
import ProjectCard from './components/ProjectCard';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';

/**
 * Projects list page — list/create/rename/delete, plus an in-place preview
 * so a project's contents can be checked without opening the workspace.
 *
 * Guest access is blocked upstream by the RequireUser route guard (see
 * App.tsx) — this component can assume a real user is always present.
 */
export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, isLoading, error, setError, create, rename, remove } = useProjects();
  const { isExpanded, getPreview, toggleExpand } = useProjectPreview();

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteConfirmId || isDeleting) return;
    setIsDeleting(true);
    try {
      await remove(deleteConfirmId);
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex-1 p-8 max-w-5xl mx-auto w-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>

      {error && (
        <div className="alert alert-error text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <CreateProjectForm onCreate={create} onError={setError} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-base-content/50">
          <FolderOpen className="w-8 h-8" />
          No projects yet — create one above to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              isExpanded={isExpanded(project.id)}
              preview={getPreview(project.id)}
              onNavigate={(id) => navigate(`/projects/${id}`)}
              onToggleExpand={toggleExpand}
              onDeleteRequest={setDeleteConfirmId}
              onRename={rename}
              onError={setError}
            />
          ))}
        </div>
      )}

      {deleteConfirmId && (
        <ConfirmDeleteModal
          title="Delete Project"
          description="This permanently deletes the project and all of its documents. This cannot be undone."
          isLoading={isDeleting}
          onCancel={() => setDeleteConfirmId(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
