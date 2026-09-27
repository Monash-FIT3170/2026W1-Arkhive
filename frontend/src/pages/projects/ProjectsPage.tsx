import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  FolderOpen,
  Pencil,
  Check,
  X,
  ChevronDown,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  createProject,
  listProjects,
  deleteProject,
  updateProject,
  getProject,
} from '../../services/projectService';
import { getDownloadUrl } from '../../services/documentService';
import type { Project, ProjectDetail } from '../../models/Project';

// Preview state for one project's expanded card: not-yet-fetched cards simply
// have no entry in the map. Kept separate from `projects` so a preview fetch
// never clobbers the lightweight list data (name/created_at) used everywhere
// else on this page.
type PreviewState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; detail: ProjectDetail; thumbnailUrl: string | null };

function pageCount(detail: ProjectDetail): number {
  return detail.documents.reduce((sum, doc) => sum + (doc.pages?.length ?? 0), 0);
}

/**
 * Projects list page — list/create/rename/delete, plus an in-place preview
 * so a project's contents can be checked without opening the workspace.
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

  // Rename is edited inline on the card, one at a time.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Which cards are expanded, and what their preview fetch turned up.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});

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

  // ── Rename ────────────────────────────────────────────────────────────
  function startRename(project: Project) {
    setRenamingId(project.id);
    setRenameValue(project.name);
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameValue('');
  }

  async function saveRename(project: Project) {
    const name = renameValue.trim();
    if (isRenaming) return;
    if (!name || name === project.name) {
      cancelRename();
      return;
    }

    setIsRenaming(true);
    setError(null);
    try {
      const updated = await updateProject(project.id, name);
      setProjects((prev) => prev.map((p) => (p.id === project.id ? updated : p)));
      cancelRename();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename project.');
    } finally {
      setIsRenaming(false);
    }
  }

  // ── Preview ───────────────────────────────────────────────────────────
  // Lazily loads a project's documents the first time its card is expanded,
  // so browsing the list never fires one request per project up front.
  async function toggleExpand(project: Project) {
    const isOpen = expandedIds.has(project.id);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (isOpen) next.delete(project.id);
      else next.add(project.id);
      return next;
    });

    if (isOpen || previews[project.id]) return;

    setPreviews((prev) => ({ ...prev, [project.id]: { status: 'loading' } }));
    try {
      const detail = await getProject(project.id);

      let thumbnailUrl: string | null = null;
      const firstDoc = detail.documents[0];
      const firstPage = firstDoc?.pages?.slice().sort((a, b) => a.page_index - b.page_index)[0];
      if (firstDoc && firstPage) {
        try {
          thumbnailUrl = await getDownloadUrl(firstDoc.id, firstPage.page_index);
        } catch {
          // Thumbnail is a nice-to-have — a missing image shouldn't block the preview.
        }
      }

      setPreviews((prev) => ({ ...prev, [project.id]: { status: 'ready', detail, thumbnailUrl } }));
    } catch (err) {
      setPreviews((prev) => ({
        ...prev,
        [project.id]: {
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load preview.',
        },
      }));
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

      {/* Project grid */}
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
          {projects.map((project) => {
            const isExpanded = expandedIds.has(project.id);
            const preview = previews[project.id];
            const isThisRenaming = renamingId === project.id;

            return (
              <div
                key={project.id}
                className="flex flex-col rounded-xl border border-base-300 bg-base-200/40 transition-colors hover:border-base-content/20 overflow-hidden"
              >
                <div
                  className={`flex flex-col gap-2 p-4 ${isThisRenaming ? '' : 'cursor-pointer'}`}
                  onClick={() => !isThisRenaming && navigate(`/projects/${project.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="w-4 h-4 shrink-0 text-primary" />
                      {isThisRenaming ? (
                        <input
                          autoFocus
                          type="text"
                          className="input input-bordered input-xs flex-1 min-w-0"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(project);
                            if (e.key === 'Escape') cancelRename();
                          }}
                          disabled={isRenaming}
                        />
                      ) : (
                        <span className="font-medium truncate">{project.name}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isThisRenaming ? (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-success"
                            title="Save name"
                            disabled={isRenaming}
                            onClick={(e) => {
                              e.stopPropagation();
                              saveRename(project);
                            }}
                          >
                            {isRenaming ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            title="Cancel"
                            disabled={isRenaming}
                            onClick={(e) => {
                              e.stopPropagation();
                              cancelRename();
                            }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            title="Rename project"
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(project);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-error"
                            title="Delete project"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(project.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <span className="text-xs text-base-content/40">
                    {new Date(project.created_at).toLocaleDateString()}
                  </span>
                </div>

                <button
                  type="button"
                  className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-base-content/60 border-t border-base-300 hover:bg-base-200 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(project);
                  }}
                >
                  <span>
                    {preview?.status === 'ready'
                      ? `${preview.detail.documents.length} document${preview.detail.documents.length === 1 ? '' : 's'} · ${pageCount(preview.detail)} page${pageCount(preview.detail) === 1 ? '' : 's'}`
                      : 'Preview contents'}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {isExpanded && (
                  <div
                    className="border-t border-base-300 bg-base-100 p-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {!preview || preview.status === 'loading' ? (
                      <div className="flex justify-center py-4">
                        <span className="loading loading-spinner loading-sm" />
                      </div>
                    ) : preview.status === 'error' ? (
                      <div className="text-xs text-error py-1">{preview.message}</div>
                    ) : preview.detail.documents.length === 0 ? (
                      <div className="text-xs text-base-content/40 py-1">No documents yet.</div>
                    ) : (
                      <div className="flex gap-3">
                        {preview.thumbnailUrl && (
                          <img
                            src={preview.thumbnailUrl}
                            alt=""
                            className="w-14 h-14 rounded-md object-cover shrink-0 border border-base-300"
                          />
                        )}
                        <ul className="flex-1 min-w-0 flex flex-col gap-1 max-h-32 overflow-y-auto">
                          {preview.detail.documents.map((doc) => (
                            <li
                              key={doc.id}
                              className="flex items-center gap-1.5 text-xs text-base-content/70 min-w-0"
                            >
                              <FileText className="w-3 h-3 shrink-0" />
                              <span className="truncate">{doc.filename}</span>
                              <span className="text-base-content/40 shrink-0">
                                ({doc.pages?.length ?? 0})
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
