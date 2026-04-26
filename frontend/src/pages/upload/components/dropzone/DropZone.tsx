import React from 'react';

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
 * * @author Muhammad Mubashir Shah (33878897)
 * * HANDOFF TODO:
 * 1. Implement 'handleInputChange' using 'filterValidFiles'.
 * 2. Implement 'handleFileDrop' and 'handleDragOver'.
 * 3. Add the UI 
 */
function DropZone({ onFilesCaptured }: { onFilesCaptured: (files: File[]) => void }) {
  // Logic implementation by next developer goes here...

  return (
    <div className="dropzone-handoff-container">
      {/* UI implementation by next developer goes here */}
    </div>
  );
}

export default DropZone;