import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, FolderOpen, Search } from 'lucide-react';
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
type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc';
export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, isLoading, error, setError, create, rename, remove } = useProjects();
  const { isExpanded, getPreview, toggleExpand } = useProjectPreview();

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const result = projects.filter((project) => project.name.toLowerCase().includes(query));

    switch (sortOption) {
      case 'oldest':
        return result.reverse();

      case 'name-asc':
        return result.sort((a, b) => a.name.localeCompare(b.name));

      case 'name-desc':
        return result.sort((a, b) => b.name.localeCompare(a.name));

      default:
        return result;
    }
  }, [projects, searchQuery, sortOption]);

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

      {/* Search and sort */}
      <div className="flex flex-col sm:flex-row gap-3">
        <label className="input input-bordered flex items-center gap-2 w-full">
          <Search className="w-4 h-4 opacity-50" />
          <input
            type="search"
            placeholder="Search projects..."
            className="grow"
            aria-label="Search projects"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </label>

        <select
          className="select select-bordered w-full sm:w-48"
          aria-label="Sort projects"
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value as SortOption)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name-asc">Name: A-Z</option>
          <option value="name-desc">Name: Z-A</option>
        </select>
      </div>

      {!isLoading && projects.length > 0 && (
        <p className="text-sm text-base-content/60">
          Showing {filteredProjects.length} of {projects.length} projects
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <span className="loading loading-spinner loading-md" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-base-content/50">
          <FolderOpen className="w-8 h-8" />
          No projects yet — create one above to get started.
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-base-content/50">
          <Search className="w-8 h-8" />
          <p>No projects match your search.</p>
          <button className="btn btn-ghost btn-sm" onClick={() => setSearchQuery('')}>
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {filteredProjects.map((project) => (
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
