import type { ExtractedPage } from './TableData';

export interface Project {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export type DocumentStatus = 'pending' | 'processing' | 'done' | 'error';

export interface DocumentRecord {
  id: string;
  project_id: string;
  storage_path: string;
  filename: string;
  status: DocumentStatus;
  /**
   * Flattened + possibly user-edited data, saved via PATCH /api/documents/:id/data.
   * Undefined/null until the user has processed and saved at least once —
   * check this (not `status`) to decide whether to skip re-running OCR.
   */
  extracted_data?: ExtractedPage[];
  created_at: string;
}

export interface ProjectDetail extends Project {
  documents: DocumentRecord[];
}

export interface UploadUrlResponse {
  uploadUrl: string;
  documentId: string;
  storageKey: string;
  /** Present when the upload is for a specific page (always, per current backend). */
  pageIndex?: number;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  documentId: string;
  filename: string;
  /** Present when the URL is for a specific page rather than the whole document. */
  pageIndex?: number;
}

/**
 * Raw per-page OCR output returned by POST /api/documents/:id/process.
 * NOT persisted by the backend — the frontend flattens this into
 * ExtractedPage[] and saves it via saveExtractedData().
 */
export interface ProcessDocumentResponse {
  success: boolean;
  documentId: string;
  status: DocumentStatus;
  rawResult: any;
}
