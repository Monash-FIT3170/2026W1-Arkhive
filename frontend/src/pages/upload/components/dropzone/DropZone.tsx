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

/**
 * Helper function to check if files are valid before we "store" them.
 * Filters based on both MIME types and file extensions for maximum compatibility.
 * * @param fileList - The raw FileList from an input or drop event
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
 * DropZone Component
 */
function DropZone({ onFilesCaptured }: { onFilesCaptured: (files: File[]) => void }) {
  
  // State to track drag-over UI state
  const [isDragOver, setIsDragOver] = useState(false);

  // Reference to hidden file input element
  const inputRef = useRef<HTMLInputElement>(null);

  //Handles file selection via file picker
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const valid = filterValidFiles(e.target.files);
    if (valid.length > 0) onFilesCaptured(valid);

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

  //Resets drag UI when file leaves dropzone
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
    onFilesCaptured(valid);      
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