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
      <p className="mb-1 mt-2 text-base font-semibold text-gray-200">Extract mode:</p>
      <button
        type="button"
        onClick={onSelectAll}
        className="h-[42px] cursor-pointer rounded-lg border border-[#3b3f4d] bg-[#1f2028] text-[15px] font-semibold text-gray-100 transition hover:bg-[#292b36]"
      >
        Select All Documents
      </button>
      <button
        type="button"
        onClick={onDeselectAll}
        className="h-[42px] cursor-pointer rounded-lg border border-[#3b3f4d] bg-[#1f2028] text-[15px] font-semibold text-gray-100 transition hover:bg-[#292b36]"
      >
        Deselect All Documents
      </button>

      <div className="rounded-lg border border-[#2f3d59] bg-[#1a2638] p-2.5 text-[13px] leading-[1.4] text-gray-200">
        {totalCount > 0
          ? `${selectedCount} of ${totalCount} document(s) selected for processing.`
          : "No uploaded files detected yet. Upload files to generate page previews."}
      </div>
    </>
  );
}

export default SelectionActions;
