import { useRef } from "react";
import { Trash2, Upload } from "lucide-react";

const REPLACE_INPUT_ACCEPT = ".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif";

type PreviewCardProps = {
  label: string;
  subtitle?: string;
  hasFile: boolean;
  index: number;
  isSelected: boolean;
  previewSrc?: string;
  isImage?: boolean;
  onToggle: (index: number) => void;
  onRemove?: (index: number) => void;
  onReplaceWithFile?: (index: number, file: File) => void;
};

function PreviewCard({
  label,
  subtitle,
  hasFile,
  index,
  isSelected,
  previewSrc,
  isImage,
  onToggle,
  onRemove,
  onReplaceWithFile,
}: PreviewCardProps) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const displayName = subtitle ? `${label} — ${subtitle}` : label;

  return (
    <article
      className={`relative min-h-[380px] rounded-[10px] border p-3 transition ${
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
          <img src={previewSrc} alt={displayName} className="h-full w-full object-contain" />
        ) : hasFile ? (
          <div className="flex h-full w-full items-center justify-center text-center text-xs font-semibold text-gray-500">
            Preview unavailable
          </div>
        ) : null}
      </div>

      <div>
        <p className="truncate text-center text-xs text-gray-300">{label}</p>
        {subtitle ? (
          <p className="mt-1 truncate text-center text-xs text-gray-400">{subtitle}</p>
        ) : (
          <p className="mt-1.5 text-center text-xs text-gray-500">{index + 1}</p>
        )}
      </div>

      {hasFile && (onRemove || onReplaceWithFile) && (
        <div className="mt-3 flex flex-col items-center gap-2">
          {onReplaceWithFile && (
            <>
              <input
                ref={replaceInputRef}
                type="file"
                className="hidden"
                accept={REPLACE_INPUT_ACCEPT}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) onReplaceWithFile(index, file);
                }}
              />
              <button
                type="button"
                className="inline-flex w-full max-w-[11rem] items-center justify-center gap-1 rounded-md border border-[#4b5563] bg-[#1f2028] px-2 py-1.5 text-center text-xs font-normal text-gray-300 transition hover:border-[#6b7280] hover:bg-[#252830] hover:text-gray-200"
                aria-label={`Replace file ${displayName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  replaceInputRef.current?.click();
                }}
              >
                <Upload className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                Replace File
              </button>
            </>
          )}
          {onRemove && (
            <button
              type="button"
              className="inline-flex w-full max-w-[11rem] items-center justify-center gap-1 rounded-md border border-[#4b5563] bg-[#1f2028] px-2 py-1.5 text-center text-xs font-normal text-gray-300 transition hover:border-[#6b7280] hover:bg-[#252830] hover:text-gray-200"
              aria-label={`Remove file ${displayName}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(index);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Remove File
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default PreviewCard;
