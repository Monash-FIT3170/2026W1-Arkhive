export async function uploadPagesToBackend(
  previewSrcs: string[],
  onRetryMessage?: (msg: string) => void
): Promise<void> {
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
    if (response.status === 502) {
      throw new Error("OCR Service failed. Please double check your credentials");
    }
    throw new Error(body.error ?? `Upload failed with status ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === 'retry') {
              if (onRetryMessage) {
                onRetryMessage(`OCR is Retrying Attempt ${msg.attempt} of ${msg.maxRetries} for "${msg.fileName}" File`);
              }
            } else if (msg.type === 'error') {
              throw new Error(msg.message || 'OCR failed. Please double check and reupload your document.');
            } else if (msg.type === 'success') {
              return;
            }
          } catch (e) {
            if (e instanceof Error && e.message !== 'Unexpected end of JSON input' && !e.message.includes('Unexpected token')) {
              throw e;
            }
          }
        }
      }
      if (done) break;
    }
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