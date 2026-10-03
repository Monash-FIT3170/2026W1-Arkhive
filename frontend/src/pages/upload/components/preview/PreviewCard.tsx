// Styled to match the page cards in ProjectWorkspacePage's Files view:
// compact 160px tile, hover-reveal checkbox/actions, status badge footer.

import { useRef, useState } from "react";
import { Trash2, RefreshCw, Eye, X } from "lucide-react";

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
  isProcessed?: boolean;
  onToggle: (index: number) => void;
  onRemove?: (index: number) => void;
  onReplaceWithFile?: (index: number, file: File) => void;
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
  isProcessed,
  onToggle,
  onRemove,
  onReplaceWithFile,
}: Props) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  const displayName = subtitle ? `${label} - ${subtitle}` : label;
  const warningMessage = shouldWarn
    ? isBlurry && isDark
      ? "Blurry and too dark"
      : isBlurry
        ? "May be blurry"
        : "May be too dark"
    : null;

  return (
    <div className="group w-[160px] shrink-0 rounded-lg border border-base-300 bg-base-100 overflow-hidden">
      <div
        className={`relative h-[120px] bg-base-300 ${hasFile ? "cursor-pointer" : "cursor-default"}`}
        onClick={() => hasFile && onToggle(index)}
      >
        {hasFile && isImage && previewSrc ? (
          <img
            src={previewSrc}
            alt={displayName}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : hasFile ? (
          <div className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] font-semibold text-base-content/50">
            Preview unavailable
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/25" />

        {hasFile && (
          <input
            type="checkbox"
            className={`checkbox checkbox-sm checkbox-primary absolute border-2 top-2 left-2 transition-opacity ${
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            checked={isSelected}
            onChange={() => onToggle(index)}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {hasFile && (
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {isImage && previewSrc && (
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle bg-base-100/80"
                title="Zoom"
                aria-label={`Zoom in on page ${displayName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsZoomOpen(true);
                }}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}

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
                  className="btn btn-ghost btn-xs btn-circle bg-base-100/80"
                  title="Replace Page"
                  aria-label={`Replace page ${displayName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    replaceInputRef.current?.click();
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                </button>
              </>
            )}

            {onRemove && (
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle bg-base-100/80 text-error"
                title="Remove Page"
                aria-label={`Remove page ${displayName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(index);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-1 p-2 text-xs">
        <span className="truncate" title={displayName}>
          {subtitle ?? label}
        </span>
        <span className={`badge badge-xs shrink-0 ${isProcessed ? "badge-success" : "badge-ghost"}`}>
          {isProcessed ? "done" : "pending"}
        </span>
      </div>

      {shouldWarn && warningMessage && (
        <div className="truncate px-2 pb-2 text-[11px] text-warning" title={warningMessage}>
          {warningMessage}
        </div>
      )}

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
    </div>
  );
}
