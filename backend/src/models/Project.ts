import type { ExtractedPage } from './TableData';

export interface Project {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export type PageStatus = 'pending' | 'processing' | 'done' | 'error';

// One row per page. This is now the thing that remembers OCR/validation
// state — `documents` itself no longer has a status or extracted_data.
export interface DocumentPageRecord {
  id: string;
  document_id: string;
  page_index: number;
  status: PageStatus;
  /** Raw per-page OCR output, persisted as soon as OCR completes for this page. */
  raw_ocr_result?: any;
  /**
   * Validated/edited data for this page, saved via
   * PATCH /api/documents/:id/pages/:pageIndex/data.
   * Check this (not `status`) to decide whether the page can skip
   * straight to the validation view without re-running OCR.
   */
  extracted_data?: ExtractedPage;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

// Documents are now a pure container: identity + storage location.
// No status, no extracted_data — those live on DocumentPageRecord.
export interface DocumentRecord {
  id: string;
  project_id: string;
  storage_path: string;
  filename: string;
  created_at: string;
  /** Populated by getDocument / getProject, ordered by page_index. */
  pages?: DocumentPageRecord[];
}

export interface ProjectDetail extends Project {
  documents: DocumentRecord[];
}

export interface UploadUrlResponse {
  uploadUrl: string;
  documentId: string;
  storageKey: string;
  pageIndex: number;
}

export interface DownloadUrlResponse {
  downloadUrl: string;
  documentId: string;
  filename: string;
  pageIndex?: number;
}

// A single page selected for (re)processing, scoped to a document.
export interface PageSelection {
  documentId: string;
  pageIndices: number[];
  /** If true, re-run OCR even on pages already marked 'done'. Default false. */
  force?: boolean;
}

// Result for one page after a batch process call.
export interface ProcessedPageResult {
  documentId: string;
  pageIndex: number;
  status: PageStatus;
  rawResult?: any;
  errorMessage?: string;
  /** True if this page was already 'done' and OCR was skipped. */
  skipped?: boolean;
}

/**
 * Response for POST /api/documents/process.
 * Covers one or many documents/pages in a single batch, and reports which
 * pages were skipped because they were already validated.
 */
export interface ProcessDocumentResponse {
  success: boolean;
  results: ProcessedPageResult[];
}
