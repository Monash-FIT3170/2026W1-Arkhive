import type { FileMetadataInput } from '../../utils/fileGrouping';

const PROCESSED_IMAGE = /\/api\/upload\/image\/([^/]+)\/([^/]+)\/?$/;

/**
 * Groups processed image URLs into files.
 * Page counts follow the processed list, so an uploaded page that was never
 * processed cannot take another file's extracted rows.
 */
export function fileMetadataFromProcessedImages(
  processedUrls: string[],
  uploadedDocs: { documentId: string; label?: string }[]
): FileMetadataInput[] | null {
  if (processedUrls.length === 0) return null;

  const labels = new Map(uploadedDocs.map((doc) => [doc.documentId, doc.label]));
  const groups: FileMetadataInput[] = [];
  let matched = 0;

  for (const url of processedUrls) {
    const match = url.match(PROCESSED_IMAGE);
    if (!match) return null;
    matched += 1;
    const fileId = decodeURIComponent(match[1]);
    const current = groups[groups.length - 1];
    if (current && current.fileId === fileId) {
      current.pageCount = (current.pageCount ?? 0) + 1;
      continue;
    }
    const label = labels.get(fileId);
    groups.push({
      fileId,
      fileName: label && label.trim() ? label : `Document ${groups.length + 1}`,
      pageCount: 1,
    });
  }

  if (matched !== processedUrls.length || groups.length === 0) return null;
  return groups;
}
