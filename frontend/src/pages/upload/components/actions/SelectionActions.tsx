// UPDATED: now also renders bulk actions ("Replace Selected" / "Remove Selected")
// that operate on whatever pages are currently selected, once at least one
// page is selected. These sit below the existing selection summary box.

import { useRef } from "react";
import { Trash2, RefreshCw } from "lucide-react"; // icons for bulk replace/remove buttons

const REPLACE_INPUT_ACCEPT = ".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif"; // matches PreviewCard's replace input

type SelectionActionsProps = {
  onSelectAll: () => void;
  onDeselectAll: () => void;
  selectedCount: number;
  totalCount: number;
  onBulkRemove: () => void;                     
  onBulkReplaceFiles: (files: File[]) => void;   
};

function SelectionActions({
  onSelectAll,
  onDeselectAll,
  selectedCount,
  totalCount,
  onBulkRemove,          
  onBulkReplaceFiles,    
}: SelectionActionsProps) {
  // hidden native multi-file input used to pick replacement files
  // for all currently selected pages at once
  const bulkReplaceInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <p className="mb-1 mt-2 text-base font-semibold text-base-content">Extract mode:</p>
      <button
        type="button"
        onClick={onSelectAll}
        className="btn btn-neutral w-full rounded-xl"
      >
        Select All Pages
      </button>
      <button
        type="button"
        onClick={onDeselectAll}
        className="btn btn-outline w-full rounded-xl"
      >
        Deselect All Pages
      </button>

      <div className="rounded-xl border border-base-300 bg-base-200 p-2.5 text-[13px] leading-[1.4] text-base-content mt-2">
        {totalCount > 0
          ? `${selectedCount} of ${totalCount} page(s) selected for processing.`
          : "No uploaded files detected yet. Upload files to generate page previews."}
      </div>

      {/* Bulk actions on the current selection — only shown once at
          least one page is selected, so they don't clutter the panel
          when nothing is selected */}
      {selectedCount > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <input
            ref={bulkReplaceInputRef}
            type="file"
            multiple
            className="hidden"
            accept={REPLACE_INPUT_ACCEPT}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) onBulkReplaceFiles(files);
            }}
          />
          <button
            type="button"
            onClick={() => bulkReplaceInputRef.current?.click()}
            className="btn btn-outline btn-sm w-full rounded-xl"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            Replace Selected ({selectedCount})
          </button>
          <button
            type="button"
            onClick={onBulkRemove}
            className="btn btn-outline btn-error btn-sm w-full rounded-xl"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            Remove Selected ({selectedCount})
          </button>
        </div>
      )}
    </>
  );
}

export default SelectionActions;
