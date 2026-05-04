import { useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import PreviewCard from "./components/grid/PreviewCard";
import SelectionActions from "./components/actions/SelectionActions";
import UploadMoreButton from "./components/actions/UploadMoreButton";
import ProcessDocumentsButton from "./components/actions/ProcessDocumentsButton";

GlobalWorkerOptions.workerSrc = pdfWorker;

type PreviewItem = {
  label: string;
  previewSrc?: string;
  isImage: boolean;
  hasFile: boolean;
};

const PLACEHOLDER_COUNT = 5;
const PDF_PREVIEW_SCALE = 2;

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function revokeObjectUrlsFromPreviewItems(items: PreviewItem[]) {
  items.forEach((item) => {
    if (item.previewSrc?.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewSrc);
    }
  });
}

async function buildPreviewItemsForFiles(
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

function PreviewPage() {
  const location = useLocation();
  const [files, setFiles] = useState<File[]>(
    () => (location.state?.files as File[] | undefined) ?? []
  );
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => new Set());
  const previousFilesRef = useRef<File[] | null>(null);
  const previewItemsRef = useRef<PreviewItem[]>([]);

  useEffect(() => {
    previewItemsRef.current = previewItems;
  }, [previewItems]);

  useEffect(() => {
    let isCancelled = false;
    const createdObjectUrls: string[] = [];

    async function syncPreviewItemsWithFiles() {
      if (files.length === 0) {
        setPreviewItems((previousItems) => {
          revokeObjectUrlsFromPreviewItems(previousItems);
          return Array.from({ length: PLACEHOLDER_COUNT }, (_, index) => ({
            label: `Page ${index + 1}`,
            isImage: false,
            hasFile: false,
          }));
        });
        setSelectedPages(new Set());
        previousFilesRef.current = [];
        return;
      }

      const previousFiles = previousFilesRef.current;
      const isAppendOnly =
        previousFiles !== null &&
        previousFiles.length > 0 &&
        files.length > previousFiles.length &&
        previousFiles.every((file, index) => file === files[index]);

      if (isAppendOnly) {
        const newFiles = files.slice(previousFiles.length);
        const appendedItems = await buildPreviewItemsForFiles(newFiles, createdObjectUrls);

        if (isCancelled) {
          createdObjectUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }

        const startIndex = previewItemsRef.current.length;
        setPreviewItems((previousItems) => [...previousItems, ...appendedItems]);

        const newIndexes = appendedItems
          .map((item, offset) => (item.hasFile ? startIndex + offset : -1))
          .filter((index) => index >= 0);

        setSelectedPages((previousSelection) => {
          const nextSelection = new Set(previousSelection);
          newIndexes.forEach((index) => nextSelection.add(index));
          return nextSelection;
        });

        previousFilesRef.current = files;
        return;
      }

      const rebuiltItems = await buildPreviewItemsForFiles(files, createdObjectUrls);

      if (isCancelled) {
        createdObjectUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setPreviewItems((previousItems) => {
        revokeObjectUrlsFromPreviewItems(previousItems);
        return rebuiltItems;
      });

      const allIndexes = rebuiltItems
        .map((item, index) => (item.hasFile ? index : -1))
        .filter((index) => index >= 0);
      setSelectedPages(new Set(allIndexes));
      previousFilesRef.current = files;
    }

    void syncPreviewItemsWithFiles();

    return () => {
      isCancelled = true;
      createdObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  function handleUploadMore(validFiles: File[]) {
    setFiles((previousFiles) => [...previousFiles, ...validFiles]);
  }

  function togglePageSelection(index: number) {
    setSelectedPages((previousSelection) => {
      const nextSelection = new Set(previousSelection);
      if (nextSelection.has(index)) {
        nextSelection.delete(index);
      } else {
        nextSelection.add(index);
      }
      return nextSelection;
    });
  }

  function selectAllPages() {
    const allFileIndexes = previewItems
      .map((item, index) => (item.hasFile ? index : -1))
      .filter((index) => index >= 0);
    setSelectedPages(new Set(allFileIndexes));
  }

  function deselectAllPages() {
    setSelectedPages(new Set());
  }

  return (
    <div className="fixed inset-0 z-10 flex h-screen w-screen flex-col bg-[#16171d] text-left text-gray-200">
      <header className="flex h-16 items-center border-b border-[#2e303a] bg-[#16171d] px-5 text-2xl font-bold text-gray-100">
        Preview
      </header>

      <div className="flex min-h-[calc(100vh-4rem)]">
        <main className="flex-1 overflow-y-auto bg-[#16171d] p-5">
          <div className="grid auto-rows-auto grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-[18px] content-start">
            {previewItems.map((file, index) => (
              <PreviewCard
                key={`${file.label}-${index}`}
                label={file.label}
                hasFile={file.hasFile}
                index={index}
                isSelected={selectedPages.has(index)}
                previewSrc={file.previewSrc}
                isImage={file.isImage}
                onToggle={togglePageSelection}
              />
            ))}
          </div>
        </main>

        <aside className="flex w-[300px] flex-col gap-3 border-l border-[#2e303a] bg-[#16171d] px-4 py-6">
          <h2 className="m-0 text-center text-4xl font-semibold text-gray-100">Document Processing</h2>

          <SelectionActions
            onSelectAll={selectAllPages}
            onDeselectAll={deselectAllPages}
            selectedCount={selectedPages.size}
            totalCount={previewItems.filter((item) => item.hasFile).length}
          />
          <ProcessDocumentsButton />
          <UploadMoreButton onFilesSelected={handleUploadMore} />
        </aside>
      </div>
    </div>
  );
}

export default PreviewPage;