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