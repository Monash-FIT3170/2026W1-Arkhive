// Shown when files.length === 0.
// Has its own local drag state and inputRef — no shared state needed with UploadPage.
// To update the look of the landing screen, this is the only file to touch.

import { useRef } from 'react';
import DropZone, { filterValidFiles } from './dropzone/DropZone';

type Props = {
  onFilesCaptured: (files: File[]) => void;
  onError?: (msg: string | null) => void;
};

function EmptyUploadView({ onFilesCaptured, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valid = filterValidFiles(e.target.files);
    if (valid.length > 0) onFilesCaptured(valid);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="bg-base-100 fixed inset-0 flex flex-col items-center justify-center">

      {/* Branding */}
      <div className="mb-10 text-center">
        <h1 className="text-base-content mb-2 text-4xl font-bold">ARKHIVE</h1>
        <p className="text-base-content/60 text-lg">
          Upload pages to begin OCR extraction
        </p>
      </div>

      {/*dropzone — drag & drop or click to add more files */}
      <div>
        <DropZone onFilesCaptured={onFilesCaptured} onError={onError} />
      </div>
      
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif"
        className="hidden"
        onChange={handleInputChange}
      />
    </div>
  );
}

export default EmptyUploadView;