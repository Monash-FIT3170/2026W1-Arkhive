/**
 * Uploads a single page to the backend immediately.
 */
export async function uploadPageToBackend(
  pageSrc: string,
  documentId: string,
  pageIndex: number,
  originalFilename: string,
  documentType?: string
): Promise<void> {
  const formData = new FormData();
  
  const res = await fetch(pageSrc);
  const blob = await res.blob();
  
  // Force .png extension since the frontend generates png blobs for previews
  const filename = originalFilename.replace(/\.[^/.]+$/, "") + ".png";
  formData.append('page', blob, filename);
  if (documentType) {
    formData.append('type', documentType);
  }
  if (originalFilename) {
    formData.append('label', originalFilename);
  }

  const response = await fetch(`/api/upload/page?documentId=${encodeURIComponent(documentId)}&pageIndex=${pageIndex}`, {
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
 * Deletes a single page from the backend.
 */
export async function deletePageFromBackend(documentId: string, pageIndex: number): Promise<void> {
  const response = await fetch(`/api/upload/page/${encodeURIComponent(documentId)}/${pageIndex}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    console.error(`Failed to delete page ${pageIndex} of document ${documentId}`);
  }
}

/**
 * Deletes an entire document from the backend.
 */
export async function deleteDocumentFromBackend(documentId: string): Promise<void> {
  const response = await fetch(`/api/upload/document/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    console.error(`Failed to delete document ${documentId}`);
  }
}

/**
 * Triggers the OCR processing for the selected documents and pages.
 */
export async function processDocuments(
  selected: { documentId: string; pages: string[]; type: string }[],
  onRetryMessage?: (msg: string) => void
): Promise<void> {
  const response = await fetch('/api/upload/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ selected }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 502) {
      throw new Error("OCR Service failed. Please double check your credentials");
    }
    throw new Error(body.error ?? `Processing failed with status ${response.status}`);
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
 * Returns a URL pointing at the specific image stored in the server session.
 */
export function getUploadedImageUrl(documentId?: string, pageIndex?: number): string {
  if (documentId !== undefined && pageIndex !== undefined) {
    return `/api/upload/image/${encodeURIComponent(documentId)}/${pageIndex}`;
  }
  return '/api/upload/image';
}

/**
 * Returns a list of structured documents from the session.
 */
export async function getUploadedDocuments(): Promise<{ documentId: string, label?: string, type?: string, pages: string[] }[]> {
  const response = await fetch('/api/upload/documents');
  if (!response.ok) {
    throw new Error('Failed to fetch uploaded documents');
  }
  return await response.json();
}

/**
 * Backward compatibility: Returns a list of all uploaded images flattened.
 */
export async function getUploadedImageUrls(): Promise<string[]> {
  const docs = await getUploadedDocuments();
  return docs.flatMap(doc => doc.pages);
}

/**
 * Returns a list of URLs for the images that were actually processed via OCR.
 */
export async function getProcessedImageUrls(): Promise<string[]> {
  const response = await fetch('/api/upload/processed-images');
  if (!response.ok) {
    throw new Error('Failed to fetch processed image URLs');
  }
  return await response.json();
}