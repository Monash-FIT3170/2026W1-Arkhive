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