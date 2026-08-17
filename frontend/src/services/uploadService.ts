import type { UploadedFileGroup } from '../models/UploadedFileGroup';

export type UploadPage = {
  src: string;
  type: string;
  /** Groups pages that came from the same source file (a PDF contributes many pages). */
  fileIndex?: number;
  /** Original file name, shown to the user when picking a file on the validation page. */
  fileName?: string;
  /** Human-readable page label within the source file, e.g. "Page 2". */
  pageLabel?: string;
};

type UploadPageMetadata = Omit<UploadPage, 'src'>;

export async function uploadPagesToBackend(pages: UploadPage[]): Promise<void> {
  const formData = new FormData();
  const metadata: UploadPageMetadata[] = [];

  for (let i = 0; i < pages.length; i++) {
    const res = await fetch(pages[i].src);
    const blob = await res.blob();
    formData.append('pages', blob, `page-${i}.png`);
    metadata.push({
      type: pages[i].type,
      fileIndex: pages[i].fileIndex,
      fileName: pages[i].fileName,
      pageLabel: pages[i].pageLabel
    });
  }

  formData.append('metadata', JSON.stringify(metadata));

  const response = await fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload failed with status ${response.status}`);
  }
}

/**
 * Returns a URL pointing at the image stored in the server session.
 * Use this as the `src` for the Document Panel image — it hits
 * GET /api/upload/image which streams the session-stored buffer back.
 */
export function getUploadedImageUrl(pageIndex?: number): string {
  return pageIndex === undefined
    ? '/api/upload/image'
    : `/api/upload/image/${pageIndex}`;
}

/**
 * Returns a list of URLs for all uploaded images in the session.
 */
export async function getUploadedImageUrls(): Promise<string[]> {
  const response = await fetch('/api/upload/images');
  if (!response.ok) {
    throw new Error('Failed to fetch image URLs');
  }
  return await response.json();
}

/**
 * Returns uploaded pages grouped by the original source file.
 */
export async function getUploadedFileGroups(): Promise<UploadedFileGroup[]> {
  const response = await fetch('/api/upload/files', {
    credentials: 'include'
  });
  if (!response.ok) {
    throw new Error('Failed to fetch uploaded files');
  }
  return await response.json();
}