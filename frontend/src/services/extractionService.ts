import type { ExtractedData, ExtractedPage } from '../models/TableData';
import type { StructuredDocument, StructuredPage } from '../models/Document';
import type { DocumentJob } from '../models/Job';
import { pageToExtractedPage } from '../utils/flattener';
import { apiUrl } from './apiBase';

/**
 * What the server can hold for a job:
 *  - StructuredPage[]:   the IR straight from the OCR pipeline (what GET /api/extraction returns)
 *  - StructuredDocument: the same IR with doc-type metadata
 *  - ExtractedPage[]:    the editor's pages, saved after edits (POST body `ocrData`)
 *  - ExtractedData:      a single legacy grid (read-only compatibility)
 */
export type StoredExtraction =
  StructuredPage[] | StructuredDocument | ExtractedPage[] | ExtractedData;

export const isStructuredPages = (d: unknown): d is StructuredPage[] =>
  Array.isArray(d) && d.length > 0 && d.every((p) => Array.isArray(p?.blocks));

export const isStructuredDocument = (d: unknown): d is StructuredDocument =>
  typeof d === 'object' &&
  d !== null &&
  'docType' in d &&
  Array.isArray((d as StructuredDocument).pages);

/**
 * Normalises whatever the server stored into the pages the editor consumes.
 * Fresh IR is flattened once; already-edited pages pass through untouched, so
 * re-loading never overwrites manual edits. Unrecognised shapes (e.g. the old
 * OCRComponent[]) yield [] instead of crashing the editor.
 */
export function toExtractedPages(data: StoredExtraction | null | undefined): ExtractedPage[] {
  if (!data) return [];
  if (isStructuredDocument(data)) return data.pages.map((p) => pageToExtractedPage(p));
  if (isStructuredPages(data)) return data.map((p) => pageToExtractedPage(p));
  if (Array.isArray(data)) {
    return (data as ExtractedPage[]).every((p) => Array.isArray(p?.rows))
      ? (data as ExtractedPage[])
      : [];
  }
  if (Array.isArray(data.columns) && Array.isArray(data.rows)) return [{ ...data, pageIndex: 0 }];
  return [];
}

async function request<T>(path: string, init: RequestInit, errorMessage: string): Promise<T> {
  const response = await fetch(apiUrl(path), { credentials: 'include', ...init });
  if (!response.ok) throw new Error(errorMessage);
  return (await response.json()) as T;
}

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const jobSelector = (jobIdOrIndex?: string | number) =>
  typeof jobIdOrIndex === 'string'
    ? { jobId: jobIdOrIndex }
    : typeof jobIdOrIndex === 'number'
      ? { index: jobIdOrIndex }
      : {};

/** GET /api/extraction returns the stored data itself (not wrapped in `{ ocrData }`). */
export function getExtractionSession(jobIdOrIndex?: string | number): Promise<StoredExtraction> {
  // encodeURIComponent (not URLSearchParams) keeps the exact URLs the server already sees.
  const params = Object.entries(jobSelector(jobIdOrIndex))
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  return request<StoredExtraction>(
    `/api/extraction${params ? `?${params}` : ''}`,
    { method: 'GET' },
    'Failed to fetch extraction session'
  );
}

/** Convenience: fetch the session and return editor-ready pages. */
export async function loadExtractedPages(jobIdOrIndex?: string | number): Promise<ExtractedPage[]> {
  return toExtractedPages(await getExtractionSession(jobIdOrIndex));
}

export function getBatchJobs(): Promise<{
  batchId: string | null;
  activeJobIndex: number | null;
  jobs: DocumentJob[];
}> {
  return request('/api/extraction/jobs', { method: 'GET' }, 'Failed to fetch batch jobs');
}

export function saveExtractionSession(data: StoredExtraction, jobIdOrIndex?: string | number) {
  return request<unknown>(
    '/api/extraction',
    jsonPost({ ocrData: data, ...jobSelector(jobIdOrIndex) }),
    'Failed to save extraction session'
  );
}

export function setActiveBatchJob(indexOrJobId: number | string): Promise<{
  success: boolean;
  activeJobIndex: number;
  activeJob: DocumentJob;
}> {
  const selector =
    typeof indexOrJobId === 'number' ? { index: indexOrJobId } : { jobId: indexOrJobId };
  return request('/api/extraction/active', jsonPost(selector), 'Failed to set active batch job');
}
