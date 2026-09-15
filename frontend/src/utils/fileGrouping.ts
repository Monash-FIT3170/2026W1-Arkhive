import type { OCRComponent } from '../models/OCRComponent';
import type { ExtractedPage } from '../models/TableData';

export interface ValidationPageItem {
  pageIndexInFile: number; // 0-based index within this file
  globalIndex: number; // 0-based index in the flat array
  imageUrl?: string;
  extractedPage: ExtractedPage;
  ocrComponents: OCRComponent[];
  pageKey?: string;
}

export interface ValidationFileGroup {
  fileId: string;
  fileName: string;
  pages: ValidationPageItem[];
  averageConfidence: number;
}

export interface FileMetadataInput {
  fileId: string;
  fileName: string;
  pageCount?: number;
  pageIndices?: number[];
}

export function calculateAverageConfidence(data: OCRComponent[]): number {
  const componentsWithConfidence = data.filter((comp) => typeof comp.confidence === 'number');
  if (componentsWithConfidence.length === 0) return 0;
  const total = componentsWithConfidence.reduce((sum, comp) => sum + comp.confidence, 0);
  return total / componentsWithConfidence.length;
}

function computeFileConfidence(componentsList: OCRComponent[][]): number {
  let sum = 0;
  let count = 0;
  for (const comps of componentsList) {
    for (const c of comps) {
      if (typeof c.confidence === 'number') {
        sum += c.confidence;
        count += 1;
      }
    }
  }
  return count > 0 ? sum / count : 1;
}

/**
 * Groups flat validation pages, OCR data, and image URLs into per-file groups.
 * Handles:
 * 1. Explicit fileMetadata list with page counts or indices
 * 2. `pageKeys` of format `${fileId}:${pageIndex}`
 * 3. Fallback: single file group containing all pages
 */
export function groupPagesByFiles(
  pages: ExtractedPage[],
  ocrPages: OCRComponent[][],
  imageUrls: string[] = [],
  pageKeys?: string[],
  fileMetadata?: FileMetadataInput[]
): ValidationFileGroup[] {
  if (pages.length === 0) {
    return [];
  }

  // Strategy 1: Explicit fileMetadata provided with pageCount
  if (fileMetadata && fileMetadata.length > 0) {
    const groups: ValidationFileGroup[] = [];
    let globalCursor = 0;

    for (const meta of fileMetadata) {
      const count = meta.pageCount ?? (meta.pageIndices ? meta.pageIndices.length : 1);
      const filePages: ValidationPageItem[] = [];

      for (let p = 0; p < count && globalCursor < pages.length; p++) {
        filePages.push({
          pageIndexInFile: p,
          globalIndex: globalCursor,
          imageUrl: imageUrls[globalCursor],
          extractedPage: pages[globalCursor],
          ocrComponents: ocrPages[globalCursor] ?? [],
          pageKey: pageKeys?.[globalCursor],
        });
        globalCursor++;
      }

      if (filePages.length > 0) {
        groups.push({
          fileId: meta.fileId,
          fileName: meta.fileName,
          pages: filePages,
          averageConfidence: computeFileConfidence(filePages.map((fp) => fp.ocrComponents)),
        });
      }
    }

    // If there are leftover pages not covered by fileMetadata, append them as an extra group
    if (globalCursor < pages.length) {
      const leftoverPages: ValidationPageItem[] = [];
      let pIdx = 0;
      while (globalCursor < pages.length) {
        leftoverPages.push({
          pageIndexInFile: pIdx++,
          globalIndex: globalCursor,
          imageUrl: imageUrls[globalCursor],
          extractedPage: pages[globalCursor],
          ocrComponents: ocrPages[globalCursor] ?? [],
          pageKey: pageKeys?.[globalCursor],
        });
        globalCursor++;
      }
      groups.push({
        fileId: 'other-documents',
        fileName: 'Remaining Pages',
        pages: leftoverPages,
        averageConfidence: computeFileConfidence(leftoverPages.map((fp) => fp.ocrComponents)),
      });
    }

    if (groups.length > 0) {
      return groups;
    }
  }

  // Strategy 2: Derive groups from pageKeys (e.g. "${fileId}:${pageIndex}")
  if (pageKeys && pageKeys.length === pages.length && pageKeys.some((k) => k.includes(':'))) {
    const groupsMap = new Map<string, ValidationPageItem[]>();

    pages.forEach((page, globalIndex) => {
      const key = pageKeys[globalIndex] ?? `file-${globalIndex}:0`;
      const [fileId] = key.split(':');
      if (!groupsMap.has(fileId)) {
        groupsMap.set(fileId, []);
      }
      const existing = groupsMap.get(fileId)!;
      existing.push({
        pageIndexInFile: existing.length,
        globalIndex,
        imageUrl: imageUrls[globalIndex],
        extractedPage: page,
        ocrComponents: ocrPages[globalIndex] ?? [],
        pageKey: key,
      });
    });

    return Array.from(groupsMap.entries()).map(([fileId, filePages], idx) => ({
      fileId,
      fileName: `File ${idx + 1}`,
      pages: filePages,
      averageConfidence: computeFileConfidence(filePages.map((p) => p.ocrComponents)),
    }));
  }

  // Strategy 3: Default fallback (single file containing all pages)
  const allPages: ValidationPageItem[] = pages.map((page, idx) => ({
    pageIndexInFile: idx,
    globalIndex: idx,
    imageUrl: imageUrls[idx],
    extractedPage: page,
    ocrComponents: ocrPages[idx] ?? [],
    pageKey: pageKeys?.[idx],
  }));

  return [
    {
      fileId: 'default-file',
      fileName: 'Uploaded Document',
      pages: allPages,
      averageConfidence: computeFileConfidence(ocrPages),
    },
  ];
}

/**
 * Translates an active file index and local page index within that file to a flat global index.
 */
export function getGlobalIndex(
  groups: ValidationFileGroup[],
  fileIndex: number,
  pageIndexInFile: number
): number {
  if (groups.length === 0) return 0;
  const clampedFileIdx = Math.max(0, Math.min(fileIndex, groups.length - 1));
  const file = groups[clampedFileIdx];
  if (!file || file.pages.length === 0) return 0;
  const clampedPageIdx = Math.max(0, Math.min(pageIndexInFile, file.pages.length - 1));
  return file.pages[clampedPageIdx].globalIndex;
}

/**
 * Translates a flat global index to { fileIndex, pageIndexInFile }.
 */
export function getFileAndLocalPage(
  groups: ValidationFileGroup[],
  globalIndex: number
): { fileIndex: number; pageIndexInFile: number } {
  if (groups.length === 0) {
    return { fileIndex: 0, pageIndexInFile: 0 };
  }

  for (let f = 0; f < groups.length; f++) {
    const file = groups[f];
    const pIdx = file.pages.findIndex((p) => p.globalIndex === globalIndex);
    if (pIdx !== -1) {
      return { fileIndex: f, pageIndexInFile: pIdx };
    }
  }

  // Default fallback if not found
  return { fileIndex: 0, pageIndexInFile: 0 };
}
