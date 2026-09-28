// The right-hand panel shown in the loaded state.
// Composes three existing components that are left completely unchanged:
//   SelectionActions, UploadMoreButton, ProcessDocumentsButton
// To reorder, add, or remove sidebar sections, this is the only file to touch.
//
// UPDATED: SelectionActions now also receives bulk remove/replace handlers
// so it can render "Replace Selected" / "Remove Selected" actions.
//
// UPDATED: Also renders a "Scan QR to upload" button under the mini dropzone
// (only when onQrUploaded is provided).

import SelectionActions from './actions/SelectionActions';
import ProcessDocumentsButton from './actions/ProcessDocumentsButton';
import ScanQrButton from './actions/ScanQrButton'; // NEW
import DropZone from './dropzone/DropZone';

type Props = {
  selectedCount: number;
  totalCount: number;
  isProcessing: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onProcess: () => void;
  onFilesCaptured: (files: File[]) => void;
  onError?: (msg: string | null) => void;
  onBulkRemove: () => void;                     // triggers bulk-remove confirmation
  onBulkReplaceFiles: (files: File[]) => void;   // triggers bulk-replace confirmation
  onQrUploaded?: () => void;                     // NEW: called when a phone upload (via QR code) lands in the session
};

export default function UploadSidebar({
  selectedCount,
  totalCount,
  isProcessing,
  onSelectAll,
  onDeselectAll,
  onProcess,
  onFilesCaptured,
  onError,
  onBulkRemove,
  onBulkReplaceFiles,
  onQrUploaded, // NEW
}: Props) {
  return (
    <aside className="border-base-300 bg-base-100 flex w-80 shrink-0 flex-col gap-2 border-l px-4 py-4 overflow-y-auto">

      <h2 className="text-base-content m-0 text-center text-2xl font-semibold">
        Document Processing
      </h2>

      <div className="divider my-0" />

      <SelectionActions
        onSelectAll={onSelectAll}
        onDeselectAll={onDeselectAll}
        selectedCount={selectedCount}
        totalCount={totalCount}
        onBulkRemove={onBulkRemove}
        onBulkReplaceFiles={onBulkReplaceFiles}
      />

      <div className="divider my-0" />

      {/* Mini dropzone — drag & drop or click to add more files */}
      <div>
        <p className="text-base-content/50 mb-2 text-xs font-medium uppercase tracking-wider">
          Add more files
        </p>
        <DropZone onFilesCaptured={onFilesCaptured} onError={onError} />
      </div>

      {/* NEW: Scan a QR code to add a photo from your phone */}
      {onQrUploaded && (
        <ScanQrButton onUploaded={onQrUploaded} className="btn btn-outline btn-sm w-full" />
      )}

      {/* Process button — pinned to the bottom */}
      <div className="mt-auto">
        <ProcessDocumentsButton
          selectedCount={selectedCount}
          isProcessing={isProcessing}
          onProcess={onProcess}
        />
      </div>

    </aside>
  );
}