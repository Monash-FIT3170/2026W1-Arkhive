import { DocumentJob } from '../../models/Job';
import type { StructuredPage } from '../../models/Document';

export type ProcessedPageEntry = {
  ocrData: StructuredPage[];
};

export type ProcessedPagesByDocument = {
  [documentId: string]: {
    [pageIndex: string]: ProcessedPageEntry;
  };
};

export type SessionDocuments = {
  [documentId: string]: {
    label?: string;
    pages: { [pageIndex: string]: unknown };
  };
};

export type ProcessedPageUpdate = {
  documentId: string;
  pageIndex: string;
  ocrData: StructuredPage[];
};

export function processedImageUrl(documentId: string, pageIndex: string): string {
  return `/api/upload/image/${documentId}/${pageIndex}`;
}

function comparePageIndex(a: string, b: string): number {
  const left = Number(a);
  const right = Number(b);
  if (Number.isFinite(left) && Number.isFinite(right)) return left - right;
  return a.localeCompare(b);
}

function averageConfidence(pages: StructuredPage[]): number {
  const blocks = pages.flatMap((page) => page.blocks).filter((block) => typeof block.confidence === 'number');
  if (blocks.length === 0) return 0;
  return blocks.reduce((sum, block) => sum + block.confidence, 0) / blocks.length;
}

/**
 * Keeps OCR for every guest page that has been processed.
 * A later batch is added. Processing the same page again replaces only that page.
 * Pages that are no longer uploaded are dropped.
 */
export function retainProcessedPages(input: {
  documents: SessionDocuments;
  processedPages?: ProcessedPagesByDocument;
  updates?: ProcessedPageUpdate[];
  createdAt?: number;
  now?: number;
}): {
  processedPages: ProcessedPagesByDocument;
  ocrData: StructuredPage[];
  processedImages: string[];
  jobs: DocumentJob[];
  createdAt: number;
  updatedAt: number;
} {
  const now = input.now ?? Date.now();
  const next: ProcessedPagesByDocument = {};

  for (const [documentId, doc] of Object.entries(input.documents)) {
    const kept = input.processedPages?.[documentId];
    if (!kept) continue;
    for (const pageIndex of Object.keys(doc.pages)) {
      if (!kept[pageIndex]) continue;
      if (!next[documentId]) next[documentId] = {};
      next[documentId][pageIndex] = kept[pageIndex];
    }
  }

  for (const update of input.updates ?? []) {
    const doc = input.documents[update.documentId];
    if (!doc || doc.pages[update.pageIndex] === undefined) continue;
    if (!next[update.documentId]) next[update.documentId] = {};
    next[update.documentId][update.pageIndex] = { ocrData: update.ocrData };
  }

  const ocrData: StructuredPage[] = [];
  const processedImages: string[] = [];
  const jobs: DocumentJob[] = [];

  for (const [documentId, doc] of Object.entries(input.documents)) {
    const pages = next[documentId];
    if (!pages) continue;

    const pageIndexes = Object.keys(pages).sort(comparePageIndex);
    if (pageIndexes.length === 0) continue;

    const documentOcr: StructuredPage[] = [];
    let firstImageUrl = '';

    for (const pageIndex of pageIndexes) {
      const imageUrl = processedImageUrl(documentId, pageIndex);
      if (!firstImageUrl) firstImageUrl = imageUrl;
      processedImages.push(imageUrl);
      const pageOcr = pages[pageIndex].ocrData ?? [];
      documentOcr.push(...pageOcr);
      ocrData.push(...pageOcr);
    }

    const jobIndex = jobs.length;
    jobs.push({
      id: `job-${documentId}`,
      documentId,
      index: jobIndex,
      fileName: doc.label || documentId,
      imageIndex: jobIndex,
      imageUrl: firstImageUrl,
      status: 'completed',
      ocrData: documentOcr,
      confidence: averageConfidence(documentOcr),
      createdAt: input.createdAt ?? now,
      updatedAt: now,
    });
  }

  return {
    processedPages: next,
    ocrData,
    processedImages,
    jobs,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };
}
