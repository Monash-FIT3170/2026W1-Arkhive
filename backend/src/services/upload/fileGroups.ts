import type { PageMetadata, UploadedFileGroup, UploadedPage } from '../../types/upload.js';

export function parseMetadata(metadataStr: unknown): PageMetadata[] {
  if (typeof metadataStr !== 'string') return [];
  try {
    const parsed = JSON.parse(metadataStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse metadata', e);
    return [];
  }
}

export function buildUploadedPage(
  filename: string,
  pageIndex: number,
  meta: PageMetadata | undefined
): UploadedPage {
  return {
    filename,
    pageIndex,
    type: meta?.type ?? 'Other',
    fileIndex: meta?.fileIndex ?? pageIndex,
    fileName: meta?.fileName || `Page ${pageIndex + 1}`,
    pageLabel: meta?.pageLabel,
  };
}

export function groupUploadedPages(pages: UploadedPage[]): UploadedFileGroup[] {
  const groups = new Map<number, UploadedFileGroup>();
  for (const page of pages) {
    let group = groups.get(page.fileIndex);
    if (!group) {
      group = {
        fileIndex: page.fileIndex,
        fileName: page.fileName,
        pageIndices: [],
      };
      groups.set(page.fileIndex, group);
    }
    group.pageIndices.push(page.pageIndex);
  }
  return Array.from(groups.values());
}
