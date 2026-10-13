import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  FolderOpen,
  Search,
  LayoutGrid,
  List,
  X,
  Plus,
  Trash2,
  Calendar,
  Pencil,
  ArrowUpRight,
  FolderPlus,
} from 'lucide-react';
import { useProjects } from '../../hooks/useProjects';
import { useProjectPreview } from '../../hooks/useProjectPreview';
import CreateProjectModal from './components/CreateProjectModal';
import ProjectCard from './components/ProjectCard';
import ProjectPreviewPanel from './components/ProjectPreviewPanel';
import ConfirmDeleteModal from './components/ConfirmDeleteModal';

type SortOption = 'newest' | 'oldest' | 'name-asc' | 'name-desc';
type ViewMode = 'grid' | 'list';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { projects, isLoading, error, setError, create, rename, remove } = useProjects();
  const { isExpanded, getPreview, toggleExpand } = useProjectPreview();

  // Create project modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Single delete modal state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Search & sorting state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('newest');

  // Multi-selection state (no manual "mode" toggle required)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Inline rename state for list view
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isSavingRename, setIsSavingRename] = useState(false);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const result = projects.filter((project) => project.name.toLowerCase().includes(query));

    switch (sortOption) {
      case 'oldest':
        return [...result].reverse();

      case 'name-asc':
        return [...result].sort((a, b) => a.name.localeCompare(b.name));

      case 'name-desc':
        return [...result].sort((a, b) => b.name.localeCompare(a.name));

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
      // Continue without saving preference
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    );
  }

  function handleToggleSelectAll() {
    if (selectedIds.length === filteredProjects.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProjects.map((p) => p.id));
    }
  }

  async function confirmDelete() {
    if (!deleteConfirmId || isDeleting) return;
    setIsDeleting(true);
    try {
      await remove(deleteConfirmId);
      // Also remove from selection if it was selected
      setSelectedIds((prev) => prev.filter((id) => id !== deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project.');
    } finally {
      setIsDeleting(false);
    }
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
      }
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function startListRename(id: string, currentName: string) {
    setRenamingId(id);
    setRenameValue(currentName);
  }

  async function saveListRename(id: string) {
    const trimmed = renameValue.trim();
    if (isSavingRename) return;
    if (!trimmed) {
      setRenamingId(null);
      return;
    }

    setIsSavingRename(true);
    try {
      await rename(id, trimmed);
      setRenamingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename project.');
    } finally {
      setIsSavingRename(false);
    }
  }

  const hasSelection = selectedIds.length > 0;

  return (
    <div className="flex-1 p-6 sm:p-8 max-w-6xl mx-auto w-full flex flex-col gap-6 text-left">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            {!isLoading && projects.length > 0 && (
              <span className="badge badge-neutral badge-sm font-medium">
                {projects.length}
              </span>
            )}
          </div>
          <p className="text-sm text-base-content/60 mt-0.5">
            Manage and organise your document extraction workspaces
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary gap-2 shrink-0 self-start sm:self-auto shadow-sm"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div
          role="alert"
          className="alert alert-error flex items-center justify-between gap-3 text-sm py-2 px-4 shadow-sm"
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

      {/* Consolidated Toolbar: Search, Sort, View Switcher */}
      {!isLoading && projects.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search bar with clear button */}
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
            <input
              type="search"
              placeholder="Search projects..."
              className="input input-bordered input-sm sm:input-md w-full pl-9 pr-8 text-sm"
              aria-label="Search projects"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle absolute right-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Right controls: Sort and View mode */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <select
              className="select select-bordered select-sm sm:select-md text-sm"
              aria-label="Sort projects"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name-asc">Name: A-Z</option>
              <option value="name-desc">Name: Z-A</option>
            </select>

            <div className="join" role="group" aria-label="Project view">
              <button
                type="button"
                className={`btn btn-sm sm:btn-md join-item ${
                  viewMode === 'grid' ? 'btn-active btn-neutral' : 'btn-ghost'
                }`}
                onClick={() => changeView('grid')}
                aria-pressed={viewMode === 'grid'}
                title="Grid view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>

              <button
                type="button"
                className={`btn btn-sm sm:btn-md join-item ${
                  viewMode === 'list' ? 'btn-active btn-neutral' : 'btn-ghost'
                }`}
                onClick={() => changeView('list')}
                aria-pressed={viewMode === 'list'}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <span className="loading loading-spinner loading-lg text-primary" />
        </div>
      ) : projects.length === 0 ? (
        /* Empty State: No projects created yet */
        <div className="flex flex-col items-center justify-center gap-4 py-20 px-4 text-center border-2 border-dashed border-base-300 rounded-2xl bg-base-100/50">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
            <FolderPlus className="w-8 h-8" />
          </div>
          <div className="max-w-sm">
            <h3 className="font-semibold text-lg text-base-content">No projects yet</h3>
            <p className="text-sm text-base-content/60 mt-1">
              Create your first project to start uploading, scanning, and extracting data from your documents.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm gap-2 mt-2 shadow-sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="w-4 h-4" />
            Create Project
          </button>
        </div>
      ) : filteredProjects.length === 0 ? (
        /* Empty State: No search results */
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center border border-base-300 rounded-xl bg-base-100/50">
          <Search className="w-8 h-8 text-base-content/30" />
          <div>
            <p className="font-medium text-base-content">No projects match &ldquo;{searchQuery}&rdquo;</p>
            <p className="text-xs text-base-content/50 mt-1">Try adjusting your search query or sorting options.</p>
          </div>
          <button className="btn btn-ghost btn-sm mt-1" onClick={() => setSearchQuery('')}>
            Clear search
          </button>
        </div>
      ) : (
        /* Projects List / Grid */
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start'
              : 'flex flex-col gap-2.5'
          }
        >
          {filteredProjects.map((project) => (
            <div key={project.id} className="w-full min-w-0">
              {viewMode === 'grid' ? (
                <ProjectCard
                  project={project}
                  isExpanded={isExpanded(project.id)}
                  preview={getPreview(project.id)}
                  onNavigate={(id) => navigate(`/projects/${id}`)}
                  onToggleExpand={toggleExpand}
                  onDeleteRequest={setDeleteConfirmId}
                  onRename={rename}
                  onError={setError}
                  hasSelection={hasSelection}
                  isSelected={selectedIds.includes(project.id)}
                  onToggleSelect={toggleSelected}
                />
              ) : (
                /* Polished List View Item */
                <div
                  className={`group rounded-xl border bg-base-100 transition-all duration-200 overflow-hidden ${
                    selectedIds.includes(project.id)
                      ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm'
                      : 'border-base-300 hover:border-primary/40 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 p-3.5">
                    {/* Left: Checkbox + Icon + Title */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm checkbox-primary rounded shrink-0"
                        aria-label={`Select ${project.name}`}
                        checked={selectedIds.includes(project.id)}
                        onChange={() => toggleSelected(project.id)}
                      />

                      <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FolderOpen className="w-4 h-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        {renamingId === project.id ? (
                          <div className="flex items-center gap-1.5 max-w-sm">
                            <input
                              autoFocus
                              type="text"
                              className="input input-bordered input-xs flex-1 min-w-0"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveListRename(project.id);
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              disabled={isSavingRename}
                            />
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs text-success px-1"
                              disabled={isSavingRename}
                              onClick={() => saveListRename(project.id)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs px-1"
                              disabled={isSavingRename}
                              onClick={() => setRenamingId(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="font-semibold text-sm truncate text-left hover:text-primary transition-colors block max-w-full"
                            onClick={() => navigate(`/projects/${project.id}`)}
                          >
                            {project.name}
                          </button>
                        )}
                        <span className="text-xs text-base-content/40 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          {new Date(project.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>

                    {/* Right: Quick actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-xs font-medium"
                        onClick={() => toggleExpand(project)}
                        aria-expanded={isExpanded(project.id)}
                      >
                        {isExpanded(project.id) ? 'Hide details' : 'Details'}
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
                        title="Rename project"
                        onClick={() => startListRename(project.id, project.name)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-error hover:bg-error/10"
                        title="Delete project"
                        onClick={() => setDeleteConfirmId(project.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        className="btn btn-primary btn-xs gap-1 ml-1"
                        onClick={() => navigate(`/projects/${project.id}`)}
                      >
                        Open
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* List View Expandable Preview Panel */}
                  {isExpanded(project.id) && (
                    <div className="border-t border-base-300">
                      <ProjectPreviewPanel preview={getPreview(project.id)} />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Floating Bottom Action Bar for Bulk Selection */}
      {hasSelection && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-base-100/95 backdrop-blur-md border border-base-300 shadow-2xl rounded-full px-5 py-2.5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 pr-3 border-r border-base-300">
            <span className="badge badge-primary badge-sm font-semibold">{selectedIds.length}</span>
            <span className="text-xs sm:text-sm font-medium text-base-content/80 whitespace-nowrap">
              selected
            </span>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-xs sm:btn-sm whitespace-nowrap"
            onClick={handleToggleSelectAll}
          >
            {selectedIds.length === filteredProjects.length ? 'Deselect all' : 'Select all'}
          </button>

          <button
            type="button"
            className="btn btn-error btn-xs sm:btn-sm gap-1.5 whitespace-nowrap shadow-sm"
            onClick={() => setShowBulkConfirm(true)}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete ({selectedIds.length})
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-circle btn-xs text-base-content/60 hover:text-base-content ml-1"
            onClick={() => setSelectedIds([])}
            aria-label="Clear selection"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={create}
        onError={setError}
      />

      {/* Single Project Delete Confirm Modal */}
      {deleteConfirmId && (
        <ConfirmDeleteModal
          title="Delete Project"
          description="This permanently deletes the project and all of its documents. This action cannot be undone."
          isLoading={isDeleting}
          onCancel={() => setDeleteConfirmId(null)}
          onConfirm={confirmDelete}
        />
      )}

      {/* Bulk Delete Confirm Modal */}
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
