import { useState } from 'react';
import {
  Trash2,
  Folder,
  FolderOpen,
  Pencil,
  Check,
  X,
  ChevronDown,
  Calendar,
  ArrowUpRight,
} from 'lucide-react';
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
  hasSelection?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
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
  isSelected = false,
  onToggleSelect,
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

  const formattedDate = new Date(project.created_at).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div
      className={`group relative flex flex-col rounded-xl border bg-base-100 transition-all duration-200 overflow-hidden ${
        isSelected
          ? 'border-primary bg-primary/5 ring-1 ring-primary shadow-sm'
          : 'border-base-300 hover:border-primary/40 hover:shadow-md'
      }`}
    >
      {/* Top Header & Main Click Area */}
      <div
        className={`flex flex-col gap-3 p-4 ${isRenaming ? '' : 'cursor-pointer'}`}
        onClick={() => !isRenaming && onNavigate(project.id)}
      >
        {/* Top Row: Folder Icon in Top-Left Corner, Actions & Always-Visible Checkbox in Top-Right */}
        <div className="flex items-center justify-between gap-2">
          {/* Folder Icon sits flush in the top-left corner */}
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            {isExpanded ? (
              <FolderOpen className="w-5 h-5" />
            ) : (
              <Folder className="w-5 h-5" />
            )}
          </div>

          {/* Action Buttons & Always-Visible Checkbox */}
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {!isRenaming && (
              <>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-base-content"
                  title="Rename project"
                  onClick={startRename}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-error hover:bg-error/10"
                  title="Delete project"
                  onClick={() => onDeleteRequest(project.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-primary"
                  title="Open workspace"
                  onClick={() => onNavigate(project.id)}
                >
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Checkbox always visible on the top right */}
            {onToggleSelect && (
              <input
                type="checkbox"
                className="checkbox checkbox-sm checkbox-primary rounded ml-1.5"
                aria-label={`Select ${project.name}`}
                checked={isSelected}
                onChange={() => onToggleSelect(project.id)}
              />
            )}
          </div>
        </div>

        {/* Project Name and Metadata */}
        <div className="flex flex-col gap-1 min-w-0">
          {isRenaming ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                autoFocus
                type="text"
                className="input input-bordered input-sm flex-1 min-w-0 font-medium"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRename();
                  if (e.key === 'Escape') cancelRename();
                }}
                disabled={isSaving}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm text-success px-2"
                title="Save name"
                disabled={isSaving}
                onClick={saveRename}
              >
                {isSaving ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm px-2"
                title="Cancel"
                disabled={isSaving}
                onClick={cancelRename}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <span className="font-semibold text-base text-base-content truncate block group-hover:text-primary transition-colors">
              {project.name}
            </span>
          )}

          <div className="flex items-center gap-2 text-xs text-base-content/50">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formattedDate}
            </span>
            {preview?.status === 'ready' && (
              <>
                <span>·</span>
                <span className="badge badge-ghost badge-xs">
                  {preview.detail.documents.length} doc{preview.detail.documents.length === 1 ? '' : 's'}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Preview Accordion */}
      <button
        type="button"
        className="flex items-center justify-between gap-2 px-4 py-2 text-xs text-base-content/60 bg-base-200/40 border-t border-base-300 hover:bg-base-200/80 transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand(project);
        }}
      >
        <span className="font-medium">
          {preview?.status === 'ready'
            ? `${preview.detail.documents.length} document${
                preview.detail.documents.length === 1 ? '' : 's'
              } · ${pageCount(preview.detail)} page${pageCount(preview.detail) === 1 ? '' : 's'}`
            : 'Preview contents'}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isExpanded && <ProjectPreviewPanel preview={preview} />}
    </div>
  );
}
