import { Trash2 } from "lucide-react";

type PreviewCardProps = {
  label: string;
  hasFile: boolean;
  index: number;
  isSelected: boolean;
  previewSrc?: string;
  isImage?: boolean;
  onToggle: (index: number) => void;
  onRemove?: (index: number) => void;
};

function PreviewCard({
  label,
  hasFile,
  index,
  isSelected,
  previewSrc,
  isImage,
  onToggle,
  onRemove,
}: PreviewCardProps) {
  return (
    <article
      className={`relative min-h-[300px] rounded-[10px] border p-3 transition ${
        isSelected
          ? "border-green-500 bg-[#1f2028] shadow-[0_0_0_1px_rgba(34,197,94,0.35)]"
          : "border-[#2e303a] bg-[#1a1c24]"
      } ${hasFile ? "cursor-pointer" : "cursor-default"}`}
      onClick={() => hasFile && onToggle(index)}
    >
      {hasFile && (
        <span
          className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
            isSelected
              ? "bg-green-500 text-white"
              : "border border-[#4b5563] bg-[#1f2028] text-transparent"
          }`}
        >
          ✓
        </span>
      )}

      <div className="mx-auto mb-[10px] mt-4 h-[220px] w-[160px] overflow-hidden rounded-[2px] border border-[#3f4350] bg-[#f8fafc] shadow-[inset_0_0_0_1px_#e5e7eb]">
        {hasFile && isImage ? (
          <img src={previewSrc} alt={label} className="h-full w-full object-contain" />
        ) : hasFile ? (
          <div className="flex h-full w-full items-center justify-center text-center text-xs font-semibold text-gray-500">
            Preview unavailable
          </div>
        ) : null}
      </div>

      <div>
        <p className="truncate text-center text-xs text-gray-300">{label}</p>
        <p className="mt-1.5 text-center text-xs text-gray-400">{index + 1}</p>
      </div>

      {hasFile && onRemove && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1 rounded-md border border-[#4b5563] bg-[#1f2028] px-2 py-1.5 text-center text-xs font-normal text-gray-300 transition hover:border-[#6b7280] hover:bg-[#252830] hover:text-gray-200"
            aria-label={`Remove ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(index);
            }}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
            Remove Image
          </button>
        </div>
      )}
    </article>
  );
}

export default PreviewCard;
