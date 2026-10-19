// Shared selection/action bar for a page grid — used by UploadPage and
// ProjectWorkspacePage's Files view. Each caller supplies its own bulk
// actions (which differ: Upload has Replace, Project doesn't) and whatever
// goes in the trailing slot (normally <UploadMoreButton>), so this component
// only owns the shell, not any page-specific behavior.

import type { ReactNode } from 'react';

export type ToolbarAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  tone?: 'primary' | 'error' | 'outline';
  text?: string;
  disabled?: boolean;
  /** Shows a spinner instead of the icon/label — for the in-flight Process action. */
  isBusy?: boolean;
};

type Props = {
  selectedCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  actions: ToolbarAction[];
  trailing?: ReactNode;
};

function toneClass(tone: ToolbarAction['tone']): string {
  switch (tone) {
    case 'primary':
      return 'btn-primary';
    case 'error':
      return 'btn-error btn-outline';
    default:
      return 'btn-outline';
  }
}

export default function PageToolbar({
  selectedCount,
  onSelectAll,
  onDeselectAll,
  actions,
  trailing,
}: Props) {
  return (
    <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg bg-base-200/40 px-4 py-2.5">
      <div className="flex items-center gap-3">
        {selectedCount > 0 ? (
          <>
            <span className="text-sm font-medium text-base-content/70">
              selected ({selectedCount})
            </span>
            <button className="btn btn-ghost btn-xs" onClick={onDeselectAll}>
              Clear
            </button>
          </>
        ) : (
          <button className="btn btn-ghost btn-sm" onClick={onSelectAll}>
            Select all
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {selectedCount > 0 &&
          actions.map((action) => (
            <button
              key={action.key}
              className={`btn btn-sm gap-1.5 ${toneClass(action.tone)} ${action.text}`}
              disabled={action.disabled}
              onClick={action.onClick}
            >
              {action.isBusy ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <>
                  {action.icon}
                  {action.label}
                </>
              )}
            </button>
          ))}
        {trailing}
      </div>
    </div>
  );
}
