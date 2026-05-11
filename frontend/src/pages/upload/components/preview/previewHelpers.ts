import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PreviewItem } from "../../types";

GlobalWorkerOptions.workerSrc = pdfWorker;

const PLACEHOLDER_COUNT = 5;
const PDF_PREVIEW_SCALE = 2;

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function revokeObjectUrlsFromPreviewItems(items: PreviewItem[]) {
  items.forEach((item) => {
    if (item.previewSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewSrc);
    }
  });
}

export async function buildPreviewItemsForFiles(
  filesToProcess: File[],
  createdObjectUrls: string[]
): Promise<PreviewItem[]> {
  const nextItems: PreviewItem[] = [];

  for (const file of filesToProcess) {
    if (isPdfFile(file)) {
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await getDocument({ data }).promise;

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: PDF_PREVIEW_SCALE });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            nextItems.push({
              label: `${file.name} (Page ${pageNumber})`,
              isImage: false,
              hasFile: true,
            });
            continue;
          }

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvas, canvasContext: context, viewport }).promise;

          nextItems.push({
            label: `${file.name} (Page ${pageNumber})`,
            previewSrc: canvas.toDataURL("image/png"),
            isImage: true,
            hasFile: true,
          });
        }
      } catch {
        nextItems.push({
          label: file.name,
          isImage: false,
          hasFile: true,
        });
      }
      continue;
    }

    if (file.type.startsWith("image/")) {
      const objectUrl = URL.createObjectURL(file);
      createdObjectUrls.push(objectUrl);
      nextItems.push({
        label: file.name,
        previewSrc: objectUrl,
        isImage: true,
        hasFile: true,
      });
      continue;
    }

    nextItems.push({
      label: file.name,
      isImage: false,
      hasFile: true,
    });
  }

  return nextItems;
}

/**
 * Helper to generate the default placeholders when no files are present.
 */
export function getPlaceholderItems(): PreviewItem[] {
  return Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => ({
    label: `Page ${index + 1}`,
    isImage: false,
    hasFile: false,
  }));
}