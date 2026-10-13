import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, FolderOpen, Search, LayoutGrid, List, X } from 'lucide-react';
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
type ViewMode = 'grid' | 'list';
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

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem('arkhive-project-view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });

  function changeView(mode: ViewMode) {
    setViewMode(mode);

    try {
      localStorage.setItem('arkhive-project-view', mode);
    } catch {
      // Continue without saving the preference.
    }
  }

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

  //bulk deletion handling
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    );
  }

  function toggleBulkMode() {
    setBulkMode((prev) => !prev);
    setSelectedIds([]);
  }

  async function confirmBulkDelete() {
    if (isBulkDeleting || selectedIds.length === 0) return;

    setIsBulkDeleting(true);
    setError(null);

    const failedIds: string[] = [];
    const total = selectedIds.length;

    try {
      for (const id of selectedIds) {
        try {
          await remove(id);
        } catch {
          failedIds.push(id);
        }
      }

      setShowBulkConfirm(false);
      setSelectedIds(failedIds);

      if (failedIds.length > 0) {
        setError(`Failed to delete ${failedIds.length} of ${total} projects.`);
      } else {
        setBulkMode(false);
      }
    } finally {
      setIsBulkDeleting(false);
    }
  }

  return (
    <div className="flex-1 p-8 max-w-5xl mx-auto w-full flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>

      {error && (
        <div
          role="alert"
          className="alert alert-error flex items-center justify-between gap-3 text-sm"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-xs shrink-0"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
            title="Dismiss error"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="mb-4">
        <CreateProjectForm onCreate={create} onError={setError} />
      </div>

      {/* Project controls */}
      <div className="flex flex-col gap-4">
        {/* Search and sorting */}
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="input input-bordered flex items-center gap-2 w-full flex-1 min-w-0">
            <Search className="w-4 h-4 opacity-50" />
            <input
              type="search"
              placeholder="Search projects..."
              className="grow min-w-0"
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

        {/* Count, view options and selection */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-base-content/60">
            {!isLoading && projects.length > 0
              ? `Showing ${filteredProjects.length} of ${projects.length} projects`
              : ''}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {/* Grid / List toggle */}
            <div className="join" role="group" aria-label="Project view">
              <button
                type="button"
                className={`btn btn-sm join-item ${
                  viewMode === 'grid' ? 'btn-primary' : 'btn-ghost'
                }`}
                onClick={() => changeView('grid')}
                aria-pressed={viewMode === 'grid'}
              >
                <LayoutGrid className="w-4 h-4" />
                Grid
              </button>

              <button
                type="button"
                className={`btn btn-sm join-item ${
                  viewMode === 'list' ? 'btn-primary' : 'btn-ghost'
                }`}
                onClick={() => changeView('list')}
                aria-pressed={viewMode === 'list'}
              >
                <List className="w-4 h-4" />
                List
              </button>
            </div>

            {/* Bulk selection toggle */}
            {!isLoading && projects.length > 0 && (
              <button
                type="button"
                className={`btn btn-sm ${bulkMode ? 'btn-primary' : 'btn-outline'}`}
                onClick={toggleBulkMode}
              >
                {bulkMode ? 'Cancel Selection' : 'Select Projects'}
              </button>
            )}
          </div>
        </div>

        {/* Bulk actions */}
        {bulkMode && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                setSelectedIds((prev) => [
                  ...new Set([...prev, ...filteredProjects.map((p) => p.id)]),
                ])
              }
              disabled={filteredProjects.length === 0}
            >
              Select Displayed
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0}
            >
              Clear
            </button>

            <button
              type="button"
              className="btn btn-error btn-sm"
              disabled={selectedIds.length === 0}
              onClick={() => setShowBulkConfirm(true)}
            >
              Delete Selected ({selectedIds.length})
            </button>
          </div>
        )}
      </div>

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
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start'
              : 'flex flex-col gap-2'
          }
        >
          {filteredProjects.map((project) => (
            <div key={project.id} className="w-full min-w-0">
              {viewMode === 'grid' ? (
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
                  bulkMode={bulkMode}
                  isSelected={selectedIds.includes(project.id)}
                  onToggleSelect={toggleSelected}
                />
              ) : (
                <div key={project.id} className="border border-base-300 rounded-lg bg-base-100">
                  <div className="flex items-center justify-between gap-3 p-3">
                    <span className="font-medium truncate min-w-0">{project.name}</span>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleExpand(project)}
                        aria-expanded={isExpanded(project.id)}
                      >
                        {isExpanded(project.id) ? 'Hide details' : 'Details'}
                      </button>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(`/projects/${project.id}`)}
                      >
                        Open
                      </button>

                      {bulkMode && (
                        <input
                          type="checkbox"
                          className="checkbox checkbox-xs rounded-full"
                          aria-label={`Select ${project.name}`}
                          checked={selectedIds.includes(project.id)}
                          onChange={() => toggleSelected(project.id)}
                        />
                      )}
                    </div>
                  </div>

                  {isExpanded(project.id) && (
                    <div className="p-3 border-t border-base-300">
                      <ProjectCard
                        project={project}
                        isExpanded={isExpanded(project.id)}
                        preview={getPreview(project.id)}
                        onNavigate={(id) => navigate(`/projects/${id}`)}
                        onToggleExpand={toggleExpand}
                        onDeleteRequest={setDeleteConfirmId}
                        onRename={rename}
                        onError={setError}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
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

      {showBulkConfirm && (
        <ConfirmDeleteModal
          title={`Delete ${selectedIds.length} Projects?`}
          description={`You are about to permanently delete ${selectedIds.length} selected projects and all their documents. This action cannot be undone.`}
          isLoading={isBulkDeleting}
          onCancel={() => {
            if (!isBulkDeleting) {
              setShowBulkConfirm(false);
            }
          }}
          onConfirm={confirmBulkDelete}
        />
      )}
    </div>
  );
}
