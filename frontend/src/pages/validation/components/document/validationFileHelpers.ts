import type { OCRComponent } from '../../../../models/OCRComponent';
import type { UploadedFileGroup } from '../../../../models/UploadedFileGroup';

export function buildFallbackFileGroups(ocrData: OCRComponent[]): UploadedFileGroup[] {
  const groups = new Map<number, UploadedFileGroup>();

  for (const component of ocrData) {
    if (component.fileIndex === undefined) continue;

    const group = groups.get(component.fileIndex) ?? {
      fileIndex: component.fileIndex,
      fileName: component.fileName ?? `File ${groups.size + 1}`,
      pageIndices: [],
    };
    if (component.pageIndex !== undefined && !group.pageIndices.includes(component.pageIndex)) {
      group.pageIndices.push(component.pageIndex);
    }
    groups.set(component.fileIndex, group);
  }

  if (groups.size > 0) return Array.from(groups.values());

  return [
    {
      fileIndex: 0,
      fileName: 'Uploaded document',
      pageIndices: [0],
    },
  ];
}

export function getOcrDataForFile(ocrData: OCRComponent[], fileIndex: number): OCRComponent[] {
  const taggedData = ocrData.filter((component) => component.fileIndex === fileIndex);
  return taggedData.length > 0 ? taggedData : ocrData;
}

export function getOcrDataForPage(ocrData: OCRComponent[], pageIndex: number): OCRComponent[] {
  const hasPageTags = ocrData.some((component) => component.pageIndex !== undefined);
  if (!hasPageTags) return ocrData;
  return ocrData.filter((component) => component.pageIndex === pageIndex);
}

export function getPageOptions(
  file: UploadedFileGroup | undefined,
  fileOcrData: OCRComponent[]
): { pageIndex: number; label: string }[] {
  const pageIndices = file?.pageIndices ?? [];
  return pageIndices.map((pageIndex, position) => {
    const labeled = fileOcrData.find(
      (component) => component.pageIndex === pageIndex && Boolean(component.pageLabel)
    );
    return {
      pageIndex,
      label: labeled?.pageLabel ?? `Page ${position + 1}`,
    };
  });
}

export function getFirstPageIndex(file: UploadedFileGroup | undefined): number {
  return file?.pageIndices[0] ?? 0;
}

export function formatFileOptionLabel(fileName: string, displayIndex: number): string {
  return `${displayIndex}. ${fileName}`;
}
