type SelectionActionsProps = {
  onSelectAll: () => void;
  onDeselectAll: () => void;
  selectedCount: number;
  totalCount: number;
};

function SelectionActions({
  onSelectAll,
  onDeselectAll,
  selectedCount,
  totalCount,
}: SelectionActionsProps) {
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
    </>
  );
}

export default SelectionActions;
