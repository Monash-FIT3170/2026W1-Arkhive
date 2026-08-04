export async function uploadPagesToBackend(pages: { src: string; type: string }[]): Promise<void> {
  const formData = new FormData();
  const metadata: { type: string }[] = [];

  for (let i = 0; i < pages.length; i++) {
    const res = await fetch(pages[i].src);
    const blob = await res.blob();
    formData.append('pages', blob, `page-${i}.png`);
    metadata.push({ type: pages[i].type });
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
export function getUploadedImageUrl(): string {
  return '/api/upload/image';
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