import { apiUrl } from './apiBase';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type {
  DocumentRecord,
  DocumentPageRecord,
  UploadUrlResponse,
  DownloadUrlResponse,
  PageSelection,
  ProcessDocumentResponse,
} from '../models/Project';
import type { ExtractedPage } from '../models/TableData';

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
 * builds storage keys and creates the page's document_pages row.
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
 * Requests a presigned URL for a page and uploads it to R2. Call once per
 * page; pass the returned documentId back in on subsequent pages of the
 * same document so they're grouped under one document row instead of
 * creating a new one each time.
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
 * Retrieves document metadata plus every page's status/extracted_data
 * (ordered by page_index). Use this on project/document open: check each
 * page's `status`/`extracted_data` to decide whether it can skip straight
 * to validation instead of being re-sent to OCR.
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
 * Triggers backend OCR processing across one or more documents in a single
 * batch call — each selection picks specific page indices from one
 * document, so pages from several files can be processed together.
 *
 * Pages already marked 'done' are skipped server-side unless `force` is set
 * on that selection (see PageSelection). Raw OCR output is persisted onto
 * each page's row as it completes, so it's safe even if the caller never
 * gets a response (e.g. navigation away mid-request).
 */
export async function processPages(selections: PageSelection[]): Promise<ProcessDocumentResponse> {
  const headers = await getAuthHeaders();
  const response = await fetch(apiUrl('/api/documents/process'), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify({ selections }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to process documents (${response.status})`);
  }

  return await response.json();
}

/**
 * Convenience wrapper around processPages() for the common case of
 * processing pages from a single document.
 */
export async function processDocumentPages(
  documentId: string,
  pageIndices: number[],
  force = false
): Promise<ProcessDocumentResponse> {
  return processPages([{ documentId, pageIndices, force }]);
}

/**
 * Persists flattened (and/or user-edited) extracted data for ONE page and
 * marks it done. Call this once after OCR + flattening for that page, and
 * again on every subsequent edit so changes survive a reload.
 */
export async function saveExtractedData(
  documentId: string,
  pageIndex: number,
  extractedData: ExtractedPage
): Promise<DocumentPageRecord> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    apiUrl(`/api/documents/${encodeURIComponent(documentId)}/pages/${pageIndex}/data`),
    {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({ extractedData }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to save extracted data (${response.status})`);
  }

  const result = await response.json();
  return result.page;
}

/**
 * Removes a single page image from R2 and its document_pages row (e.g. user
 * deletes one page of a multi-page document before or after processing).
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
 * database row (document_pages rows cascade automatically).
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
