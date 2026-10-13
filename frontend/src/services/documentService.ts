import { apiUrl } from './apiBase';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type {
  DocumentRecord,
  DocumentPageRecord,
  DownloadUrlResponse,
  PageSelection,
  ProcessDocumentResponse,
} from '../models/Project';
import type { ExtractedPage } from '../models/TableData';
import type { PageReview } from '../models/IssueReview';

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

export async function uploadPageToR2(
  projectId: string,
  fileOrBlob: Blob | File,
  filename: string,
  pageIndex: number,
  documentId?: string
): Promise<{ documentId: string; storageKey: string; pageIndex: number; qualityFlags?: any }> {
  const headers = await getAuthHeaders();
  const formData = new FormData();

  const finalFilename = filename.replace(/\.[^/.]+$/, '') + '.png';
  formData.append('page', fileOrBlob, finalFilename);
  formData.append('projectId', projectId);
  formData.append('filename', filename);
  formData.append('pageIndex', pageIndex.toString());
  
  if (documentId) {
    formData.append('documentId', documentId);
  }

  // Remove Content-Type from headers so fetch can set the multipart boundary automatically
  delete headers['Content-Type'];

  const response = await fetch(apiUrl('/api/documents/upload-page'), {
    method: 'POST',
    headers,
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to upload page (${response.status})`);
  }

  const data = await response.json();
  
  return {
    documentId: data.documentId,
    storageKey: data.storageKey,
    pageIndex: data.pageIndex,
    qualityFlags: data.qualityFlags,
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
 * Retrieves document metadata plus every page's status/extracted_data.
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
 * Triggers backend OCR processing across one or more documents in a single batch call.
 * Completed pages are skipped server-side unless `force` is set.
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
 * Persists extracted data for one page and marks it done.
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
 * Removes a single page image from R2 and its document_pages row.
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
 * Deletes a document and its pages from R2 storage and the database.
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

/**
 * Persists the review state for one page.
 */
export async function saveReviewState(
  documentId: string,
  pageIndex: number,
  reviewState: PageReview | null
): Promise<DocumentPageRecord> {
  const headers = await getAuthHeaders();
  const response = await fetch(
    apiUrl(`/api/documents/${encodeURIComponent(documentId)}/pages/${pageIndex}/review`),
    {
      method: 'PATCH',
      headers,
      credentials: 'include',
      body: JSON.stringify({ reviewState }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `Failed to save review state (${response.status})`);
  }

  const result = await response.json();
  return result.page;
}
