import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Supported OCR MIME types.
 * Exported so it can be used in tests.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'image/heic',
  'image/heif',
  'image/tiff'
];

// Maximum file size limit in MB
export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Helper function to check if files are valid based on MIME types and file extensions.
 * @param fileList - The raw FileList from an input or drop event
 * @returns An array of validated File objects
 */
export function filterValidFiles(fileList: FileList | null): File[] {
  if (!fileList) return [];

  const filesArray = Array.from(fileList);

  return filesArray.filter(function isSupportedFile(file) {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const isAcceptedExt = ['jpg', 'jpeg', 'png', 'pdf', 'heic', 'heif', 'tiff', 'tif'].includes(fileExtension || '');
    const isAcceptedMime = ALLOWED_MIME_TYPES.includes(file.type);

    return isAcceptedMime || isAcceptedExt;
  });
}

/**
 * Separate valid and oversized files before passing to parent.
 * Exported so other consumers can reuse the same logic.
 * @param files - Array of type-validated files
 * @returns Object with accepted (within limit) and rejected (oversized) arrays
 */
export function partitionBySize(files: File[]): { accepted: File[]; rejected: File[] } {
  const accepted: File[] = [];
  const rejected: File[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      rejected.push(file);
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

type DropZoneProps = {
  onFilesCaptured: (files: File[]) => void;
  onError?: (msg: string | null) => void;
};

export default function DropZone({ onFilesCaptured, onError }: DropZoneProps) {

  const [sizeError, setSizeError] = useState<string | null>(null);

  // Reference to hidden file input element
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Run files through size check before passing to parent.
   * Accepted files proceed; rejected files trigger an error message.
   */
  function processFiles(files: File[]) {
    if (onError) onError(null); else setSizeError(null);
    const { accepted, rejected } = partitionBySize(files);

    if (rejected.length > 0) {
      const names = rejected.map((f) => f.name).join(', ');
      const msg = `${rejected.length} file(s) exceed the ${MAX_FILE_SIZE_MB}MB limit and were not added: ${names}`;
      if (onError) onError(msg);
      else setSizeError(msg);
    }

    if (accepted.length > 0) onFilesCaptured(accepted);
  }

  // Handles file selection via file picker
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valid = filterValidFiles(e.target.files);
    if (valid.length > 0) processFiles(valid);

    // Reset input to allow re-selecting same file
    if (inputRef.current) inputRef.current.value = '';
  }

  // --- Global Drag and Drop ---
  const [isGlobalDrag, setIsGlobalDrag] = useState(false);

  useEffect(() => {
    let dragCounter = 0;

    const handleWindowDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounter++;
        if (dragCounter === 1) {
          setIsGlobalDrag(true);
        }
      }
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounter--;
        if (dragCounter === 0) {
          setIsGlobalDrag(false);
        }
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault(); // Necessary to allow dropping
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsGlobalDrag(false);

      if (e.dataTransfer?.files) {
        const valid = filterValidFiles(e.dataTransfer.files);
        if (valid.length > 0) {
          processFiles(valid);
        }
      }
    };

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [onError, onFilesCaptured]);

  return (
    <div className="dropzone-handoff-container">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif"
        style={{ display: 'none' }}
        onChange={handleInputChange}
      />

      {/* Error message for oversized files */}
      {!onError && sizeError && (
        <div className="alert alert-error mb-2 p-3 text-sm rounded-xl flex items-start gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{sizeError}</span>
        </div>
      )}

      {/* Basic UI for dropzone area (click to select) */}
      <div
        className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 border-base-content/30 bg-base-200/50 hover:bg-base-200`}
        onClick={() => inputRef.current?.click()}
      >
        <p className="text-base-content font-medium">Click to select files, or drop them anywhere</p>
        <p className="text-base-content/60 mt-1 text-sm font-semibold">JPG · PNG · PDF · HEIC · HEIF · TIFF</p>

        {/* Size limit indicator */}
        <p className="text-base-content/40 mt-1 text-xs">
          Max file size: {MAX_FILE_SIZE_MB}MB
        </p>

        {/* Basic file picker button (triggers hidden input) */}
        <button
          type="button"
          className="btn btn-primary mt-4 rounded-xl"
          onClick={(e) => {
            e.stopPropagation(); // IMPORTANT
            inputRef.current?.click();
          }}
        >
          Select Files
        </button>
      </div>

      {/* Global Full-Screen Drag Overlay */}
      {isGlobalDrag && createPortal(
        <div className="fixed inset-0 z-[99999] bg-base-100/80 backdrop-blur-sm flex items-center justify-center p-8 transition-all duration-300 pointer-events-none">
          <div className="w-full h-full border-[6px] border-primary border-dashed rounded-[3rem] flex flex-col items-center justify-center bg-primary/5 animate-pulse">
            <div className="bg-base-100 p-8 rounded-full shadow-2xl mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h2 className="text-5xl font-extrabold text-primary drop-shadow-sm tracking-tight">Drop files to upload</h2>
            <p className="text-primary/70 mt-4 text-xl font-medium">Release your mouse to add files to ARKHIVE</p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
