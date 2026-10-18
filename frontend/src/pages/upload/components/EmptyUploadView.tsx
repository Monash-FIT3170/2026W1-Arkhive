// Shown when files.length === 0.
// Has its own local drag state and inputRef — no shared state needed with UploadPage.
// To update the look of the landing screen, this is the only file to touch.

import DropZone from './dropzone/DropZone';
import ScanQrButton from './actions/ScanQrButton'; // NEW

type Props = {
  onFilesCaptured: (files: File[]) => void;
  onError?: (msg: string | null) => void;
  onQrUploaded?: () => void; // NEW: called when a phone upload (via QR code) lands in the session
};

export default function EmptyUploadView({ onFilesCaptured, onError, onQrUploaded }: Props) { // NEW: onQrUploaded added to props

  return (
    <div className="bg-base-100 w-full flex flex-col items-center justify-center" style={{ minHeight: 'calc(100vh - 4rem)' }}>

      {/* Branding */}
      <div className="mb-10 text-center">
        <h1 className="text-base-content mb-2 text-4xl font-bold">ARKHIVE</h1>
        <p className="text-base-content/60 text-lg">
          Upload pages to begin OCR extraction
        </p>
      </div>

      {/* Dropzone for dragging/dropping or selecting files */}
      <div className="w-full max-w-lg px-4">
        <DropZone onFilesCaptured={onFilesCaptured} onError={onError} />
      </div>

      {/* NEW: Scan a QR code to upload a photo from your phone, just below the dropzone */}
      {onQrUploaded && (
        <div className="mt-4 w-full max-w-lg px-4">
          <ScanQrButton onUploaded={onQrUploaded} className="btn btn-outline btn-sm w-full" />
        </div>
      )}
    </div>
  );
}