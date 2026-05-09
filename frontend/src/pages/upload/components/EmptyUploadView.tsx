// Shown when files.length === 0.
// Has its own local drag state and inputRef — no shared state needed with UploadPage.
// To update the look of the landing screen, this is the only file to touch.

import { useRef, useState } from 'react';
import { filterValidFiles } from './dropzone/DropZone';

type Props = {
  onFilesCaptured: (files: File[]) => void;
};

function EmptyUploadView({ onFilesCaptured }: Props) {
  const inputRef    = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valid = filterValidFiles(e.target.files);
    if (valid.length > 0) onFilesCaptured(valid);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleDragOver(e: React.DragEvent)  { e.preventDefault(); setIsDragOver(true);  }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragOver(false); }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const valid = filterValidFiles(e.dataTransfer.files);
    if (valid.length > 0) onFilesCaptured(valid);
  }

  return (
    <div className="bg-base-100 fixed inset-0 flex flex-col items-center justify-center">

      {/* Branding */}
      <div className="mb-10 text-center">
        <h1 className="text-base-content mb-2 text-4xl font-bold">Arkhive</h1>
        <p className="text-base-content/60 text-lg">
          Upload documents to begin OCR extraction
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif"
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Drop target */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          border-base-300 bg-base-200 hover:bg-base-300
          flex w-full max-w-xl cursor-pointer flex-col items-center
          gap-5 rounded-2xl border-2 border-dashed px-16 py-16
          transition-all duration-200
          ${isDragOver ? 'border-primary bg-primary/10' : ''}
        `}
      >
        <svg
          className={`h-14 w-14 transition-colors ${isDragOver ? 'text-primary' : 'text-base-content/30'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}
        >
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 16v-8m0 0-3 3m3-3 3 3M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
        </svg>

        <div className="text-center">
          <p className="text-base-content text-lg font-semibold">Drag & drop files here</p>
          <p className="text-base-content/50 mt-1 text-sm">or click to browse</p>
        </div>

        <span className="badge badge-ghost badge-sm tracking-widest uppercase">
          JPG · PNG · PDF · HEIC · HEIF · TIFF
        </span>
      </div>
    </div>
  );
}

export default EmptyUploadView;