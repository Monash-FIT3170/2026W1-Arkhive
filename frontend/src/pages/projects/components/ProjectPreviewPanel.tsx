import { FileText } from 'lucide-react';
import type { PreviewState } from '../../../hooks/useProjectPreview';

interface ProjectPreviewPanelProps {
  preview: PreviewState | undefined;
}

export default function ProjectPreviewPanel({ preview }: ProjectPreviewPanelProps) {
  return (
    <div className="border-t border-base-300 bg-base-100 p-3" onClick={(e) => e.stopPropagation()}>
      {!preview || preview.status === 'loading' ? (
        <div className="flex justify-center py-4">
          <span className="loading loading-spinner loading-sm" />
        </div>
      ) : preview.status === 'error' ? (
        <div className="text-xs text-error py-1">{preview.message}</div>
      ) : preview.detail.documents.length === 0 ? (
        <div className="text-xs text-base-content/40 py-1">No documents yet.</div>
      ) : (
        <div className="flex gap-3">
          {preview.thumbnailUrl && (
            <img
              src={preview.thumbnailUrl}
              alt=""
              className="w-14 h-14 rounded-md object-cover shrink-0 border border-base-300"
            />
          )}
          <ul className="flex-1 min-w-0 flex flex-col gap-1 max-h-32 overflow-y-auto">
            {preview.detail.documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-1.5 text-xs text-base-content/70 min-w-0"
              >
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate">{doc.filename}</span>
                <span className="text-base-content/40 shrink-0">({doc.pages?.length ?? 0})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
