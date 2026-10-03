// Shared page-thumbnail card — used by both UploadPage and
// ProjectWorkspacePage's Files view. Deliberately knows nothing about either
// page's data model (preview items vs. documents/pages): callers adapt their
// own shape into these generic props, the same way pages adapt into
// <ValidationWorkspace>'s pages/ocrPages/imageUrls props.

import { useRef, useState } from "react";
import { Trash2, RefreshCw, Eye, X } from "lucide-react";

const REPLACE_INPUT_ACCEPT = ".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif";

export type CardStatus = {
  text: string;
  /** Extra class(es) applied alongside `badge badge-xs`, e.g. "badge-success". */
  className: string;
};

type Props = {
  /** Full accessible name — used for alt text, aria-labels, and tooltips. */
  title: string;
  /** Short footer text; falls back to `title` when omitted. */
  caption?: string;
  /** False renders a static, non-interactive tile (no checkbox/hover actions). Default true. */
  isSelectable?: boolean;
  isSelected: boolean;
  thumbnailUrl?: string;
  /** False means "this isn't an image at all" (render the unavailable state) rather than
   *  "still loading" — default true, since most callers always have an image. */
  isImage?: boolean;
  /** Currently being processed elsewhere — disables interaction and shows a busy look. */
  isBusy?: boolean;
  status?: CardStatus;
  warningText?: string;
  errorText?: string;
  onToggle: () => void;
  onRemove?: () => void;
  onReplaceWithFile?: (file: File) => void;
};

export default function PreviewCard({
  title,
  caption,
  isSelectable = true,
  isSelected,
  thumbnailUrl,
  isImage = true,
  isBusy = false,
  status,
  warningText,
  errorText,
  onToggle,
  onRemove,
  onReplaceWithFile,
}: Props) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  const interactive = isSelectable && !isBusy;

  return (
    <div
      className={`group w-40 shrink-0 rounded-lg border border-base-300 bg-base-100 overflow-hidden transition-opacity ${
        isBusy ? "animate-pulse opacity-80" : ""
      }`}
    >
      <div
        className={`relative h-30 bg-base-300 ${interactive ? "cursor-pointer" : "cursor-not-allowed"}`}
        onClick={() => interactive && onToggle()}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            className={`h-full w-full object-cover transition-[filter] ${isBusy ? "grayscale" : ""}`}
            draggable={false}
          />
        ) : isImage ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="loading loading-spinner loading-sm" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] font-semibold text-base-content/50">
            Preview unavailable
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/25" />

        {interactive && (
          <input
            type="checkbox"
            className={`checkbox checkbox-sm checkbox-primary absolute border-2 top-2 left-2 transition-opacity ${
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            checked={isSelected}
            onChange={onToggle}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {interactive && (
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {thumbnailUrl && (
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle bg-base-100/80"
                title="Zoom"
                aria-label={`Zoom in on ${title}`}
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
                    if (file) onReplaceWithFile(file);
                  }}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-circle bg-base-100/80"
                  title="Replace Page"
                  aria-label={`Replace ${title}`}
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
                aria-label={`Remove ${title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-1 p-2 text-xs">
        <span className="truncate" title={title}>
          {caption ?? title}
        </span>
        {status && (
          <span className={`badge badge-xs shrink-0 ${status.className}`}>{status.text}</span>
        )}
      </div>

      {warningText && (
        <div className="truncate px-2 pb-2 text-[11px] text-warning" title={warningText}>
          {warningText}
        </div>
      )}

      {errorText && (
        <div className="truncate px-2 pb-2 text-[11px] text-error" title={errorText}>
          {errorText}
        </div>
      )}

      {isZoomOpen && thumbnailUrl && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/80 p-6"
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
            src={thumbnailUrl}
            alt={title}
            className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
