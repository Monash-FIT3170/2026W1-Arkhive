import type { OCRComponent } from '../models/OCRComponent';

// The OCR backend stores one page's result per document_pages row, but the
// real Azure/Gemini pipeline wraps it as `Pages` — [{ page_num, components }]
// — while the OCR_MODE=mock fixture returns a flat OCRComponent[] instead.
// Unwrap defensively so either shape renders correctly.
export function extractComponents(raw: unknown): OCRComponent[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const first = raw[0] as any;
  if (first && typeof first === 'object' && Array.isArray(first.components)) {
    return first.components as OCRComponent[];
  }
  return raw as OCRComponent[];
}

export function pageKey(documentId: string, pageIndex: number): string {
  return `${documentId}:${pageIndex}`;
}
