import type { BatchProgressEvent, DocumentJob } from '../models/Job';

export interface UploadPageInput {
  src: string;
  type: string;
  fileName?: string;
}

export interface BatchUploadResult {
  success: boolean;
  batchId?: string;
  pageCount: number;
  jobs?: DocumentJob[];
  ocrData?: any[];
}

export async function uploadPagesToBackend(
  pages: UploadPageInput[],
  onRetryMessage?: (msg: string) => void,
  onProgress?: (event: BatchProgressEvent) => void
): Promise<BatchUploadResult | void> {
  const formData = new FormData();
  const metadata: { type: string; fileName?: string }[] = [];

  for (let i = 0; i < pages.length; i++) {
    const res = await fetch(pages[i].src);
    const blob = await res.blob();
    const fileName = pages[i].fileName || `page-${i}.png`;
    formData.append('pages', blob, fileName);
    metadata.push({ type: pages[i].type, fileName });
  }

  formData.append('metadata', JSON.stringify(metadata));

  const response = await fetch('/api/upload', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 502) {
      throw new Error('OCR Service failed. Please double check your credentials');
    }
    throw new Error(body.error ?? `Upload failed with status ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (reader) {
    const decoder = new TextDecoder();
    let buffer = '';
    let result: BatchUploadResult | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg: BatchProgressEvent = JSON.parse(line);

            if (onProgress) {
              onProgress(msg);
            }

            if (msg.type === 'retry') {
              if (onRetryMessage) {
                onRetryMessage(
                  `OCR is Retrying Attempt ${msg.attempt} of ${msg.maxRetries} for "${msg.fileName}" File`
                );
              }
            } else if (msg.type === 'error') {
              throw new Error(msg.message || 'OCR failed. Please double check and reupload your document.');
            } else if (msg.type === 'success') {
              result = msg.data;
            }
          } catch (e) {
            if (
              e instanceof Error &&
              e.message !== 'Unexpected end of JSON input' &&
              !e.message.includes('Unexpected token')
            ) {
              throw e;
            }
          }
        }
      }
      if (done) break;
    }

    return result;
  }
}

/**
 * Returns a URL pointing at the image stored in the server session.
 * Use this as the `src` for the Document Panel image — it hits
 * GET /api/upload/image or GET /api/upload/image/:index which streams the session-stored buffer back.
 */
export function getUploadedImageUrl(index?: number): string {
  if (typeof index === 'number') {
    return `/api/upload/image/${index}`;
  }
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