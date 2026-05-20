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
  isBlurry?: boolean;
  isDark?: boolean;
  shouldWarn?: boolean;
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
  isBlurry,
  isDark,
  shouldWarn,
  onToggle,
  onRemove,
  onReplaceWithFile,
}: PreviewCardProps) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const displayName = subtitle ? `${label} - ${subtitle}` : label;
  const warningMessage = shouldWarn
    ? isBlurry && isDark
      ? "Image may be blurry and too dark"
      : isBlurry
        ? "Image may be blurry"
        : "Image may be too dark"
    : null;

  return (
    <article
      className={`relative min-h-[380px] rounded-[10px] border p-3 transition ${
        isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-base-300 bg-base-200"
      } ${hasFile ? "cursor-pointer" : "cursor-default"}`}
      onClick={() => hasFile && onToggle(index)}
    >
      {hasFile && (
        <span
          className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
            isSelected
              ? "bg-primary text-primary-content"
              : "border border-base-content/20 bg-base-300 text-transparent"
          }`}
        >
          ✓
        </span>
      )}

      <div className="mx-auto mb-[10px] mt-4 h-[220px] w-[160px] overflow-hidden rounded-[2px] border border-base-300 bg-base-100 shadow-sm">
        {hasFile && isImage ? (
          <img src={previewSrc} alt={displayName} className="h-full w-full object-contain" />
        ) : hasFile ? (
          <div className="flex h-full w-full items-center justify-center text-center text-xs font-semibold text-base-content/50">
            Preview unavailable
          </div>
        ) : null}
      </div>

      <div>
        <p className="truncate text-center text-xs text-base-content">{label}</p>
        {subtitle ? (
          <p className="mt-1 truncate text-center text-xs text-base-content/70">{subtitle}</p>
        ) : (
          <p className="mt-1.5 text-center text-xs text-base-content/50">{index + 1}</p>
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
                className="btn btn-outline btn-sm w-full max-w-[11rem] font-normal"
                aria-label={`Replace page ${displayName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  replaceInputRef.current?.click();
                }}
              >
                <Upload className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                Replace Page
              </button>
            </>
          )}
          {onRemove && (
            <button
              type="button"
              className="btn btn-outline btn-error btn-sm w-full max-w-[11rem] font-normal"
              aria-label={`Remove page ${displayName}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(index);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              Remove Page
            </button>
          )}

          {shouldWarn && warningMessage && (
            <div className="mb-2 rounded-md border border-warning/80 bg-warning/10 px-2 py-1 text-center text-[12px] text-warning font-bold">
              {warningMessage}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default PreviewCard;
