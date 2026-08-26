// Shown when files.length === 0.
// Has its own local drag state and inputRef — no shared state needed with UploadPage.
// To update the look of the landing screen, this is the only file to touch.

import DropZone from './dropzone/DropZone';

type Props = {
  onFilesCaptured: (files: File[]) => void;
  onError?: (msg: string | null) => void;
};

export default function EmptyUploadView({ onFilesCaptured, onError }: Props) {

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
    </div>
  );
}