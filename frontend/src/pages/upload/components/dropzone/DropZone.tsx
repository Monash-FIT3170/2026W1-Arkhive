import React, {useState, useRef} from 'react';

/**
 * Configuration: Supported OCR MIME types.
 * Exported so it can be used in tests and by the next developer.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg', 
  'image/png', 
  'application/pdf', 
  'image/heic', 
  'image/heif', 
  'image/tiff'
];

// US-1.6: define the maximum file size limit
export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Helper function to check if files are valid before we "store" them.
 * Filters based on both MIME types and file extensions for maximum compatibility.
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
 * US-1.6: separate valid and oversized files before passing to parent.
 * Exported so EmptyUploadView and other consumers can reuse the same logic.
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

/**
 * DropZone Component
 */
function DropZone({ onFilesCaptured }: { onFilesCaptured: (files: File[]) => void }) {
  
  // State to track drag-over UI state
  const [isDragOver, setIsDragOver] = useState(false);

  // US-1.6: state to track oversized file error message
  const [sizeError, setSizeError] = useState<string | null>(null);

  // Reference to hidden file input element
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * US-1.6: run files through size check before passing to parent.
   * Accepted files proceed; rejected files trigger an error message.
   */
  function processFiles(files: File[]) {
    setSizeError(null);
    const { accepted, rejected } = partitionBySize(files);

    if (rejected.length > 0) {
      const names = rejected.map((f) => f.name).join(', ');
      setSizeError(
        `${rejected.length} file(s) exceed the ${MAX_FILE_SIZE_MB}MB limit and were not added: ${names}`
      );
    }

    if (accepted.length > 0) onFilesCaptured(accepted);
  }

  // Handles file selection via file picker
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valid = filterValidFiles(e.target.files);
    if (valid.length > 0) processFiles(valid); // US-1.6: check size

    // Reset input to allow re-selecting same file
    if (inputRef.current) inputRef.current.value = '';
  }

  /**
   * Enables drop by preventing default browser behavior
   * Also activates drag UI state
   */
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(true);
  }

  // Resets drag UI when file leaves dropzone
  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
  }

  /**
   * Handles file drop event
   * Filters valid files and sends them to parent
   */
  function handleFileDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);

    const valid = filterValidFiles(e.dataTransfer.files);

    if (valid.length > 0) {
      console.log(valid);      // Debug: confirm captured files
      processFiles(valid);     // US-1.6: check size
    }
  }

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

      {/* US-1.6: error message for oversized files, shown above the dropzone */}
      {sizeError && (
        <div style={{
          marginBottom: '8px',
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid #fca5a5',
          backgroundColor: '#fef2f2',
          color: '#dc2626',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px'
        }}>
          <svg xmlns="http://www.w3.org/2000/svg" style={{ marginTop: '2px', height: '12px', width: '12px', flexShrink: 0 }} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span>{sizeError}</span>
        </div>
      )}

      {/* Basic UI for dropzone area (drag & drop interaction) */}
      <div
        style={{
          border: `2px dashed ${isDragOver ? '#3b82f6' : '#9ca3af'}`,
          borderRadius: '12px',
          padding: '40px',
          minHeight: '200px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          textAlign: 'center',
          cursor: 'pointer',
          backgroundColor: isDragOver ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
          transition: 'all 0.2s ease'
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleFileDrop}
      >
        <p>Drag & drop files here, or click to select</p>
        <p className="dropzone-hint">JPG · PNG · PDF · HEIC · HEIF · TIFF</p>

        {/* US-1.6: display size limit so users know before selecting */}
        <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
          Max file size: {MAX_FILE_SIZE_MB}MB
        </p>

        {/* Basic file picker button (triggers hidden input) */}
        <button
          style={{
            marginTop: '12px',
            padding: '16px 24px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            fontSize: '16px',
            fontWeight: '500'
          }}
          onClick={(e) => {
            e.stopPropagation(); // IMPORTANT
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