// UploadPage is the orchestrator: it owns state, effects, and handlers.
// All UI is delegated to focused child components.
//
// To change the empty-state look  →  edit EmptyUploadView.tsx
// To change the sidebar           →  edit UploadSidebar.tsx
// To change PDF/canvas logic      →  edit components/grid/previewHelpers.ts
// To change the preview cards     →  edit components/grid/PreviewCard.tsx

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import type { PreviewItem } from './types';
import { buildPreviewItemsForFiles, revokeObjectUrlsFromPreviewItems } from './components/preview/previewHelpers';
import EmptyUploadView from './components/EmptyUploadView';
import UploadSidebar   from './components/UploadSidebar';
import PreviewCard     from './components/preview/PreviewCard';

function UploadPage() {
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [files,         setFiles]         = useState<File[]>([]);
  const [previewItems,  setPreviewItems]  = useState<PreviewItem[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isProcessing,  setIsProcessing]  = useState(false);

  // Refs let the async preview-sync effect read current values without
  // needing them as dependencies (which would cause infinite loops).
  const previousFilesRef  = useRef<File[] | null>(null);
  const previewItemsRef   = useRef<PreviewItem[]>([]);

  useEffect(() => { previewItemsRef.current = previewItems; }, [previewItems]);

  // ── Keep preview grid in sync whenever the files array changes ─────────────
  useEffect(() => {
    let isCancelled = false;
    const createdObjectUrls: string[] = [];

    async function syncPreviewItems() {
      // Files cleared → reset everything
      if (files.length === 0) {
        setPreviewItems((prev) => { revokeObjectUrlsFromPreviewItems(prev); return []; });
        setSelectedPages(new Set());
        previousFilesRef.current = [];
        return;
      }

      const previousFiles = previousFilesRef.current;

      // Append-only: only render the newly added files, keep existing items
      const isAppendOnly =
        previousFiles !== null &&
        previousFiles.length > 0 &&
        files.length > previousFiles.length &&
        previousFiles.every((f, i) => f === files[i]);

      if (isAppendOnly) {
        const newFiles      = files.slice(previousFiles.length);
        const appendedItems = await buildPreviewItemsForFiles(newFiles, createdObjectUrls);
        if (isCancelled) { createdObjectUrls.forEach(URL.revokeObjectURL); return; }

        const startIndex = previewItemsRef.current.length;
        setPreviewItems((prev) => [...prev, ...appendedItems]);

        // Auto-select every newly added page
        const newIndexes = appendedItems
          .map((item, offset) => (item.hasFile ? startIndex + offset : -1))
          .filter((i) => i >= 0);
        setSelectedPages((prev) => {
          const next = new Set(prev);
          newIndexes.forEach((i) => next.add(i));
          return next;
        });

        previousFilesRef.current = files;
        return;
      }

      // Full rebuild (first load or files replaced)
      const rebuiltItems = await buildPreviewItemsForFiles(files, createdObjectUrls);
      if (isCancelled) { createdObjectUrls.forEach(URL.revokeObjectURL); return; }

      setPreviewItems((prev) => { revokeObjectUrlsFromPreviewItems(prev); return rebuiltItems; });

      const allIndexes = rebuiltItems
        .map((item, i) => (item.hasFile ? i : -1))
        .filter((i) => i >= 0);
      setSelectedPages(new Set(allIndexes));
      previousFilesRef.current = files;
    }

    void syncPreviewItems();

    return () => {
      isCancelled = true;
      createdObjectUrls.forEach(URL.revokeObjectURL);
    };
  }, [files]);

  // ── File capture ───────────────────────────────────────────────────────────
  function captureFiles(incoming: File[]) {
    setFiles((prev) => [...prev, ...incoming]);
  }

  // ── Page selection ─────────────────────────────────────────────────────────
  function togglePageSelection(index: number) {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  function selectAllPages() {
    setSelectedPages(
      new Set(previewItems.map((item, i) => (item.hasFile ? i : -1)).filter((i) => i >= 0))
    );
  }

  function deselectAllPages() {
    setSelectedPages(new Set());
  }

  // ── Process: send selected pages to OCR backend, then navigate ─────────────
  async function handleProcess() {
    if (selectedPages.size === 0 || isProcessing) return;
    setIsProcessing(true);

    try {
      const selectedItems = [...selectedPages]
        .sort((a, b) => a - b)
        .map((i) => previewItems[i])
        .filter((item) => item?.previewSrc);

      const formData = new FormData();
      for (let i = 0; i < selectedItems.length; i++) {
        // fetch() resolves both blob: URLs (images) and data: URLs (PDF canvases)
        const blob = await fetch(selectedItems[i].previewSrc!).then((r) => r.blob());
        formData.append('pages', blob, `page-${i}.png`);
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

      navigate('/validation');
    } catch (err) {
      console.error('Processing failed:', err);
      alert('Processing failed. Check the console for details.');
    } finally {
      setIsProcessing(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // No files yet → full-screen landing dropzone
  if (files.length === 0) {
    return <EmptyUploadView onFilesCaptured={captureFiles} />;
  }

  // Files loaded → split layout: preview grid left, sidebar right
  return (
    <div className="bg-base-100 fixed inset-0 z-10 flex flex-col">

      <header className="border-base-300 bg-base-100 text-base-content flex h-16 shrink-0 items-center border-b px-5 text-2xl font-bold">
        Preview
      </header>

      <div className="flex min-h-0 flex-1">

        {/* Preview grid */}
        <main className="bg-base-100 flex-1 overflow-y-auto p-5">
          <div className="grid auto-rows-auto grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-[18px]">
            {previewItems.map((item, index) => (
              <PreviewCard
                key={`${item.label}-${index}`}
                label={item.label}
                hasFile={item.hasFile}
                index={index}
                isSelected={selectedPages.has(index)}
                previewSrc={item.previewSrc}
                isImage={item.isImage}
                onToggle={togglePageSelection}
              />
            ))}
          </div>
        </main>

        {/* Sidebar */}
        <UploadSidebar
          selectedCount={selectedPages.size}
          totalCount={previewItems.filter((item) => item.hasFile).length}
          isProcessing={isProcessing}
          onSelectAll={selectAllPages}
          onDeselectAll={deselectAllPages}
          onProcess={handleProcess}
          onFilesCaptured={captureFiles}
        />

      </div>
    </div>
  );
}

export default UploadPage;