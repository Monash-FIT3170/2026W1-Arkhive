import { useState } from 'react';
import { Trash2, FolderOpen, Pencil, Check, X, ChevronDown } from 'lucide-react';
import type { Project } from '../../../models/Project';
import ProjectPreviewPanel from './ProjectPreviewPanel';
import { pageCount, type PreviewState } from '../../../hooks/useProjectPreview';

interface ProjectCardProps {
  project: Project;
  isExpanded: boolean;
  preview: PreviewState | undefined;
  onNavigate: (id: string) => void;
  onToggleExpand: (project: Project) => void;
  onDeleteRequest: (id: string) => void;
  onRename: (id: string, name: string) => Promise<unknown>;
  onError: (message: string) => void;
}

export default function ProjectCard({
  project,
  isExpanded,
  preview,
  onNavigate,
  onToggleExpand,
  onDeleteRequest,
  onRename,
  onError,
}: ProjectCardProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [isSaving, setIsSaving] = useState(false);

  function startRename() {
    setRenameValue(project.name);
    setIsRenaming(true);
  }

  function cancelRename() {
    setIsRenaming(false);
  }

  async function saveRename() {
    const name = renameValue.trim();
    if (isSaving) return;
    if (!name || name === project.name) {
      cancelRename();
      return;
    }

    setIsSaving(true);
    try {
      await onRename(project.id, name);
      setIsRenaming(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to rename project.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col rounded-xl border border-base-300 bg-base-200/40 transition-colors hover:border-base-content/20 overflow-hidden">
      <div
        className={`flex flex-col gap-2 p-4 ${isRenaming ? '' : 'cursor-pointer'}`}
        onClick={() => !isRenaming && onNavigate(project.id)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FolderOpen className="w-4 h-4 shrink-0 text-primary" />
            {isRenaming ? (
              <input
                autoFocus
                type="text"
                className="input input-bordered input-xs flex-1 min-w-0"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRename();
                  if (e.key === 'Escape') cancelRename();
                }}
                disabled={isSaving}
              />
            ) : (
              <span className="font-medium truncate">{project.name}</span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {isRenaming ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-success"
                  title="Save name"
                  disabled={isSaving}
                  onClick={(e) => {
                    e.stopPropagation();
                    saveRename();
                  }}
                >
                  {isSaving ? (
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  title="Cancel"
                  disabled={isSaving}
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
                    startRename();
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
                    onDeleteRequest(project.id);
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
          onToggleExpand(project);
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

      {isExpanded && <ProjectPreviewPanel preview={preview} />}
    </div>
  );
}
