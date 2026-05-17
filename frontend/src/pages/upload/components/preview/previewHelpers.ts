// Use pdf.js legacy build because the normal one was crashing on render with
// "getOrInsertComputed is not a function" (caused by new Map APIs + Vite's bundling).
// Legacy bundles polyfills so that API exists and render works.

// import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
// import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
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

  for (let fileIndex = 0; fileIndex < filesToProcess.length; fileIndex += 1) {
    const file = filesToProcess[fileIndex];
    if (isPdfFile(file)) {
      let pdf: Awaited<ReturnType<typeof getDocument>["promise"]>;
      try {
        const data = new Uint8Array(await file.arrayBuffer());
        pdf = await getDocument({ data }).promise;
      } catch (err) {
        console.error("[preview] PDF load failed:", file.name, err);
        nextItems.push({
          label: file.name,
          isImage: false,
          hasFile: true,
          fileIndex,
        });
        continue;
      }

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        try {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: PDF_PREVIEW_SCALE });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            nextItems.push({
              label: file.name,
              subtitle: `Page ${pageNumber}`,
              isImage: false,
              hasFile: true,
              fileIndex,
            });
            continue;
          }

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          await page.render({ canvas, canvasContext: context, viewport }).promise;

          nextItems.push({
            label: file.name,
            subtitle: `Page ${pageNumber}`,
            previewSrc: canvas.toDataURL("image/png"),
            isImage: true,
            hasFile: true,
            fileIndex,
          });
        } catch (err) {
          console.error(`[preview] PDF page render failed: ${file.name} p.${pageNumber}`, err);
          nextItems.push({
            label: file.name,
            subtitle: `Page ${pageNumber}`,
            isImage: false,
            hasFile: true,
            fileIndex,
          });
        }
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
        fileIndex,
      });
      continue;
    }

    nextItems.push({
      label: file.name,
      isImage: false,
      hasFile: true,
      fileIndex,
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