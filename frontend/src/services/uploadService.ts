export async function uploadPagesToBackend(previewSrcs: string[]): Promise<void> {
  const formData = new FormData();

  for (let i = 0; i < previewSrcs.length; i++) {
    const res = await fetch(previewSrcs[i]);
    const blob = await res.blob();
    formData.append('pages', blob, `page-${i}.png`);
  }

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