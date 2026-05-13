// UploadPage is the orchestrator: it owns state, effects, and handlers.
// All UI is delegated to focused child components.
//
// To change the empty-state look  →  edit EmptyUploadView.tsx
// To change the sidebar           →  edit UploadSidebar.tsx
// To change PDF/canvas logic      →  edit components/preview/previewHelpers.ts
// To change the preview cards     →  edit components/preview/PreviewCard.tsx

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
  const [uploadError,   setUploadError]   = useState<string | null>(null); // US-1.4
  const [uploadSuccess, setUploadSuccess] = useState(false);               // US-1.5

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

  // ── Remove preview ──────────────────────────────────────────────────────────
  // For pdfs with multiple pages, they share a file index, so removing one page removes the whole PDF.
  function handleRemovePreview(previewIndex: number) {
    const item = previewItemsRef.current[previewIndex];
    if (!item?.hasFile || item.fileIndex === undefined) return;
    const { fileIndex } = item;
    setFiles((prev) => {
      if (fileIndex < 0 || fileIndex >= prev.length) return prev;
      return prev.filter((_, i) => i !== fileIndex);
    });
  }

  // ── Process: send selected pages to OCR backend, then navigate ─────────────
  async function handleProcess() {
    if (selectedPages.size === 0 || isProcessing) return;
    setIsProcessing(true);
    setUploadError(null);    // US-1.4: clear any previous error before retrying
    setUploadSuccess(false); // US-1.5: clear any previous success before retrying

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

      // US-1.4: detect upload failure and extract reason from response
      if (!response.ok) {
        let reason = `Upload failed (${response.status} ${response.statusText})`;
        try {
          const body = await response.json();
          if (body?.message) reason = body.message;
        } catch {
          // response wasn't JSON — use the status-based reason above
        }
        throw new Error(reason);
      }

      // US-1.5: detect successful upload and show success notification
      setUploadSuccess(true);
      setTimeout(() => {
        navigate('/validation');
      }, 1500);

    } catch (err) {
      // US-1.4: store error message in state to display near upload area
      const message = err instanceof Error ? err.message : 'An unexpected error occurred during upload.';
      setUploadError(message);
      console.error('Processing failed:', err);
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

      {/* US-1.4: Error notification banner placed above the upload/preview area */}
      {uploadError && (
        <div className="bg-error/10 border-error text-error flex items-start gap-3 border-l-4 px-5 py-3 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <div className="flex-1">
            <p className="font-semibold">Upload failed</p>
            <p className="opacity-90">{uploadError}</p>
          </div>
          <button
            className="opacity-60 hover:opacity-100"
            onClick={() => setUploadError(null)}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* US-1.5: Success notification banner */}
      {uploadSuccess && (
        <div className="bg-success/10 border-success text-success flex items-center gap-3 border-l-4 px-5 py-3 text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="font-semibold">Upload successful</p>
            <p className="opacity-90">Redirecting to validation...</p>
          </div>
        </div>
      )}

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
                onRemove={handleRemovePreview}
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