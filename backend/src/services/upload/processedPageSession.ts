import { DocumentJob } from '../../models/Job';

export type ProcessedPageEntry = {
  ocrData: any[];
};

export type ProcessedPagesByDocument = {
  [documentId: string]: {
    [pageIndex: string]: ProcessedPageEntry;
  };
};

export type SessionDocuments = {
  [documentId: string]: {
    label?: string;
    pages: { [pageIndex: string]: string };
  };
};

export type ProcessedPageUpdate = {
  documentId: string;
  pageIndex: string;
  ocrData: any[];
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

function averageConfidence(ocrData: any[]): number {
  const scored = ocrData.filter((item) => typeof item?.confidence === 'number');
  if (scored.length === 0) return 0;
  const total = scored.reduce((sum, item) => sum + item.confidence, 0);
  return total / scored.length;
}

/**
 * Keeps OCR for every guest page that has been processed.
 * A later batch is added. Processing the same page again replaces only that page.
 * Pages that are no longer on the uploaded document are dropped.
 */
export function retainProcessedPages(input: {
  documents: SessionDocuments;
  processedPages?: ProcessedPagesByDocument;
  updates?: ProcessedPageUpdate[];
  createdAt?: number;
  now?: number;
}): {
  processedPages: ProcessedPagesByDocument;
  ocrData: any[];
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

  const ocrData: any[] = [];
  const processedImages: string[] = [];
  const jobs: DocumentJob[] = [];

  for (const [documentId, doc] of Object.entries(input.documents)) {
    const pages = next[documentId];
    if (!pages) continue;

    const pageIndexes = Object.keys(pages).sort(comparePageIndex);
    const documentOcr: any[] = [];
    let firstImageUrl = '';

    for (const pageIndex of pageIndexes) {
      const imageUrl = processedImageUrl(documentId, pageIndex);
      if (!firstImageUrl) firstImageUrl = imageUrl;
      processedImages.push(imageUrl);
      const pageOcr = pages[pageIndex].ocrData ?? [];
      documentOcr.push(...pageOcr);
      ocrData.push(...pageOcr);
    }

    if (pageIndexes.length === 0) continue;

    jobs.push({
      id: `job-${documentId}`,
      index: jobs.length,
      fileName: doc.label || documentId,
      imageIndex: jobs.length,
      imageUrl: firstImageUrl,
      status: 'completed',
      ocrData: documentOcr as DocumentJob['ocrData'],
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
