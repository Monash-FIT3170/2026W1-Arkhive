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
  hasSelection = false,
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
        <div className="flex items-start justify-between gap-2">
          {/* Left: Selection checkbox + Icon */}
          <div className="flex items-center gap-2.5 min-w-0">
            {onToggleSelect && (
              <div
                className={`transition-opacity duration-150 shrink-0 ${
                  hasSelection || isSelected
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm checkbox-primary rounded"
                  aria-label={`Select ${project.name}`}
                  checked={isSelected}
                  onChange={() => onToggleSelect(project.id)}
                />
              </div>
            )}

            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {isExpanded ? (
                <FolderOpen className="w-5 h-5" />
              ) : (
                <Folder className="w-5 h-5" />
              )}
            </div>

            {/* Name or Rename Input */}
            <div className="min-w-0 flex-1">
              {isRenaming ? (
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    autoFocus
                    type="text"
                    className="input input-bordered input-xs flex-1 min-w-0 font-medium"
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
                    className="btn btn-ghost btn-xs text-success px-1"
                    title="Save name"
                    disabled={isSaving}
                    onClick={saveRename}
                  >
                    {isSaving ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs px-1"
                    title="Cancel"
                    disabled={isSaving}
                    onClick={cancelRename}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="font-semibold text-base text-base-content truncate block group-hover:text-primary transition-colors">
                  {project.name}
                </span>
              )}
            </div>
          </div>

          {/* Right: Action Buttons */}
          {!isRenaming && (
            <div
              className="flex items-center gap-0.5 shrink-0 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
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
            </div>
          )}
        </div>

        {/* Date and Metadata */}
        <div className="flex items-center gap-3 text-xs text-base-content/50 pl-0.5">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            {formattedDate}
          </span>
          {preview?.status === 'ready' && (
            <span className="badge badge-ghost badge-xs">
              {preview.detail.documents.length} doc{preview.detail.documents.length === 1 ? '' : 's'}
            </span>
          )}
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
