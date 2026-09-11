import { apiUrl } from './apiBase';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { DocumentRecord, UploadUrlResponse, DownloadUrlResponse } from '../models/Project';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.access_token) {
        headers['Authorization'] = `Bearer ${data.session.access_token}`;
      }
    } catch {
      // Supabase auth not initialized or offline
    }
  }

  return headers;
}

/**
 * Requests a presigned PUT URL from the backend to upload a single page image
 * directly to Cloudflare R2. Documents are always stored as per-page PNGs
 * (page-{pageIndex}.png) — pageIndex is required to match how the backend
 * builds storage keys and later discovers/OCRs pages (see documents.ts).
 *
 * Pass `documentId` when uploading additional pages to a document that
 * already has a row (created by the first page's upload).
 */
export async function getUploadUrl(
  projectId: string,
  filename: string,
  pageIndex: number,
  contentType: string = 'image/png',
  documentId?: string
): Promise<UploadUrlResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl('/api/documents/upload-url'), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({
      projectId,
      filename,
      contentType,
      pageIndex,
      ...(documentId ? { documentId } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to generate upload URL (${response.status})`);
  }

  return await response.json();
}

/**
 * Uploads a file or blob directly to Cloudflare R2 using a presigned PUT URL.
 * File bytes bypass the Express backend entirely.
 */
export async function uploadToR2(
  uploadUrl: string,
  fileOrBlob: Blob | File,
  contentType: string = 'image/png'
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: fileOrBlob,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file directly to R2 (${response.status})`);
  }
}

/**
 * Requests a presigned URL for that
 * page and uploads it to R2. Call once per page; pass the returned
 * documentId back in on subsequent pages of the same document so they're
 * grouped under one document row instead of creating a new one each time.
 */
export async function uploadPageToR2(
  projectId: string,
  fileOrBlob: Blob | File,
  filename: string,
  pageIndex: number,
  contentType: string = 'image/png',
  documentId?: string
): Promise<{ documentId: string; storageKey: string; pageIndex: number }> {
  const {
    uploadUrl,
    documentId: docId,
    storageKey,
    pageIndex: returnedPageIndex,
  } = await getUploadUrl(projectId, filename, pageIndex, contentType, documentId);

  await uploadToR2(uploadUrl, fileOrBlob, contentType);

  return {
    documentId: docId,
    storageKey,
    pageIndex: returnedPageIndex ?? pageIndex,
  };
}

/**
 * Requests a presigned GET URL to view or download a document (or a specific
 * page, if pageIndex is provided) from Cloudflare R2.
 */
export async function getDownloadUrl(documentId: string, pageIndex?: number): Promise<string> {
  const headers = await getAuthHeaders();
  const path =
    pageIndex !== undefined
      ? `/api/documents/${encodeURIComponent(documentId)}/pages/${pageIndex}/url`
      : `/api/documents/${encodeURIComponent(documentId)}/download-url`;

  const response = await fetch(apiUrl(path), {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to get download URL (${response.status})`);
  }

  const data: DownloadUrlResponse = await response.json();
  return data.downloadUrl;
}

/**
 * Retrieves document metadata, status, and extracted_data (if it has already
 * been processed and saved). Use this on project/document open to avoid
 * re-running OCR when a saved result already exists.
 */
export async function getDocument(documentId: string): Promise<DocumentRecord> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/documents/${encodeURIComponent(documentId)}`), {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to fetch document (${response.status})`);
  }

  return await response.json();
}

/**
 * Triggers backend OCR processing on all (or a specific set of) pages of a
 * document stored in R2. Returns the RAW per-page OCR output — this is NOT
 * persisted by the backend. The caller is responsible for flattening it into
 * ExtractedPage[] and calling saveExtractedData() to persist it.
 */
export async function processDocument(
  documentId: string,
  pages?: (number | string)[]
): Promise<{
  success: boolean;
  documentId: string;
  status: string;
  rawResult: any;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/documents/${encodeURIComponent(documentId)}/process`), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(pages ? { pages } : {}),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to process document (${response.status})`);
  }

  return await response.json();
}

/**
 * Persists flattened (and/or user-edited) extracted data for a document.
 * Call this once after OCR + flattening, and again on every subsequent edit
 * so changes survive a reload. Sets the document's status to 'done'.
 */
export async function saveExtractedData(
  documentId: string,
  extractedData: unknown[]
): Promise<DocumentRecord> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/documents/${encodeURIComponent(documentId)}/data`), {
    method: 'PATCH',
    headers,
    credentials: 'include',
    body: JSON.stringify({ extractedData }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to save extracted data (${response.status})`);
  }

  const result = await response.json();
  return result.document;
}

/**
 * Removes a single page image from R2 (e.g. user deletes one page of a
 * multi-page document before processing).
 */
export async function deletePage(documentId: string, pageIndex: number): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    apiUrl(`/api/documents/${encodeURIComponent(documentId)}/pages/${pageIndex}`),
    {
      method: 'DELETE',
      headers,
      credentials: 'include',
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to delete page (${response.status})`);
  }
}

/**
 * Deletes a document — removes all of its page objects from R2 and its
 * database row.
 */
export async function deleteDocument(documentId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl(`/api/documents/${encodeURIComponent(documentId)}`), {
    method: 'DELETE',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to delete document (${response.status})`);
  }
}
