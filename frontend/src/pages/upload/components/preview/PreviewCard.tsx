import { useRef, useState } from "react";
import { Trash2, RefreshCw, Tag, Eye, X } from "lucide-react";

const REPLACE_INPUT_ACCEPT = ".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif";

type Props = {
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
  documentType?: string;
  onChangeType?: (index: number) => void;
};

export default function PreviewCard({
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
  documentType,
  onChangeType,
}: Props) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const displayName = subtitle ? `${label} - ${subtitle}` : label;
  const warningMessage = shouldWarn
    ? isBlurry && isDark
      ? "Image may be blurry and too dark"
      : isBlurry
        ? "Image may be blurry"
        : "Image may be too dark"
    : null;

  // NEW: controls the zoomed-image lightbox modal
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  return (
    <article
      className={`relative min-h-[380px] rounded-[10px] border p-3 transition ${isSelected
        ? "border-primary bg-primary/5 ring-1 ring-primary"
        : "border-base-300 bg-base-200"
        } ${hasFile ? "cursor-pointer" : "cursor-default"}`}
      onClick={() => hasFile && onToggle(index)}
    >
      {hasFile && (
        <span
          className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${isSelected
            ? "bg-primary text-primary-content"
            : "border border-base-content/20 bg-base-300 text-transparent"
            }`}
        >
          ✓
        </span>
      )}

      {/* NEW: Zoom button — top-right corner, opens a lightbox with the full-size image */}
      {hasFile && isImage && previewSrc && (
        <button
          type="button"
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-base-100/90 border border-base-300 text-base-content hover:bg-primary hover:text-primary-content transition"
          aria-label={`Zoom in on page ${displayName}`}
          onClick={(e) => {
            e.stopPropagation();
            setIsZoomOpen(true);
          }}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden />
        </button>
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
        {documentType && (
          <div className="mt-1 flex justify-center">
            <span className="badge badge-primary badge-outline badge-sm">
              {documentType}
            </span>
          </div>
        )}
      </div>

      {/* UPDATED: Replace/Remove/Change Type are now a compact icon-only row
          instead of stacked full-width text buttons */}
      {hasFile && (onRemove || onReplaceWithFile || onChangeType) && (
        <div className="mt-3 flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-2">
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
                  className="btn btn-outline btn-sm btn-square"
                  aria-label={`Replace page ${displayName}`}
                  title="Replace Page"
                  onClick={(e) => {
                    e.stopPropagation();
                    replaceInputRef.current?.click();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                </button>
              </>
            )}
            {onRemove && (
              <button
                type="button"
                className="btn btn-outline btn-error btn-sm btn-square"
                aria-label={`Remove page ${displayName}`}
                title="Remove Page"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(index);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              </button>
            )}
            {onChangeType && (
              <button
                type="button"
                className="btn btn-outline btn-sm btn-square"
                aria-label={`Change type of page ${displayName}`}
                title="Change Type"
                onClick={(e) => {
                  e.stopPropagation();
                  onChangeType(index);
                }}
              >
                <Tag className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
              </button>
            )}
          </div>

          {shouldWarn && warningMessage && (
            <div className="mb-2 rounded-md border border-warning/80 bg-warning/10 px-2 py-1 text-center text-[12px] text-warning font-bold">
              {warningMessage}
            </div>
          )}
        </div>
      )}

      {/* NEW: Zoom lightbox — shows the full-size image over a dark backdrop */}
      {isZoomOpen && previewSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={(e) => {
            e.stopPropagation();
            setIsZoomOpen(false);
          }}
        >
          <button
            type="button"
            className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-base-100 text-base-content hover:bg-error hover:text-error-content transition"
            aria-label="Close zoomed image"
            onClick={(e) => {
              e.stopPropagation();
              setIsZoomOpen(false);
            }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <img
            src={previewSrc}
            alt={displayName}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </article>
  );
}