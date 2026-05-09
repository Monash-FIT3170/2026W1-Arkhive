// Logic is identical to the original — only the inline style objects have been
// replaced with Tailwind/DaisyUI classes so the component matches the rest of
// the app. filterValidFiles and ALLOWED_MIME_TYPES are unchanged and exported.

import React, { useState, useRef } from 'react';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'image/heic',
  'image/heif',
  'image/tiff',
];

export function filterValidFiles(fileList: FileList | null): File[] {
  if (!fileList) return [];

  return Array.from(fileList).filter((file) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isAcceptedExt  = ['jpg', 'jpeg', 'png', 'pdf', 'heic', 'heif', 'tiff', 'tif'].includes(ext ?? '');
    const isAcceptedMime = ALLOWED_MIME_TYPES.includes(file.type);
    return isAcceptedMime || isAcceptedExt;
  });
}

function DropZone({ onFilesCaptured }: { onFilesCaptured: (files: File[]) => void }) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valid = filterValidFiles(e.target.files);
    if (valid.length > 0) onFilesCaptured(valid);
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    const valid = filterValidFiles(e.dataTransfer.files);
    if (valid.length > 0) onFilesCaptured(valid);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif"
        className="hidden"
        onChange={handleInputChange}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleFileDrop}
        className={`
          border-base-300 bg-base-200 hover:bg-base-300
          flex min-h-[200px] cursor-pointer flex-col items-center justify-center
          gap-3 rounded-xl border-2 border-dashed p-10 text-center
          transition-all duration-200
          ${isDragOver ? 'border-primary bg-primary/10' : ''}
        `}
      >
        <p className="text-base-content font-medium">
          Drag & drop files here, or click to select
        </p>
        <p className="text-base-content/50 text-sm tracking-widest uppercase">
          JPG · PNG · PDF · HEIC · HEIF · TIFF
        </p>

        <button
          type="button"
          className="btn btn-primary btn-sm mt-2"
          onClick={(e) => {
            e.stopPropagation(); // prevent the outer div from also firing
            inputRef.current?.click();
          }}
        >
          Select Files
        </button>
      </div>
    </div>
  );
}

export default DropZone;