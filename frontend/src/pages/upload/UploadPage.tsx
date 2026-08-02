// UploadPage is the orchestrator: it owns state, effects, and handlers.
// All UI is delegated to focused child components.
//
// To change the empty-state look  →  edit EmptyUploadView.tsx
// To change the sidebar           →  edit UploadSidebar.tsx
// To change PDF/canvas logic      →  edit components/preview/previewHelpers.ts
// To change the preview cards     →  edit components/preview/PreviewCard.tsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { unlockStep } from '../../services/stepGuard.ts';

import type { PreviewItem } from './types';
import { buildPreviewItemsForFiles } from './components/preview/previewHelpers';
import EmptyUploadView from './components/EmptyUploadView';
import UploadSidebar from './components/UploadSidebar';
import PreviewCard from './components/preview/PreviewCard';
import {
  filterValidFiles,
  partitionBySize,
  MAX_FILE_SIZE_MB,
} from './components/dropzone/DropZone';
import { uploadPagesToBackend } from '../../services/uploadService';

function UploadPage() {
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null); // US-1.4
  const [uploadSuccess, setUploadSuccess] = useState(false);               // US-1.5
  const [replaceConfirm, setReplaceConfirm] = useState<{
    previewIndex: number;
    newFile: File;
    itemTitle: string;
  } | null>(null);

  // bulk-remove confirmation — holds the sorted list of preview indices
  // the user wants to remove, so we can show a confirmation modal before doing it
  const [removeConfirm, setRemoveConfirm] = useState<number[] | null>(null);

  // bulk-replace confirmation — holds the previewIndex/newFile/title pairs
  // computed after the user picks files for their selected pages, so we can show
  // a "this page → this file" summary modal before committing the swap
  const [bulkReplaceConfirm, setBulkReplaceConfirm] = useState<
    { previewIndex: number; newFile: File; itemTitle: string }[] | null
  >(null);

  // Refs
  const previewItemsRef = useRef<PreviewItem[]>([]);
  const createdUrlsRef = useRef<string[]>([]);

  useEffect(() => { previewItemsRef.current = previewItems; }, [previewItems]);

  useEffect(() => {
    if (previewItems.length > 0) {
      navigate('/?step=preview', { replace: true });
    }
  }, [previewItems, navigate]);


  // Clean up object URLs when leaving the page
  useEffect(() => {
    return () => {
      createdUrlsRef.current.forEach(URL.revokeObjectURL);
    };
  }, []);

  // ── File capture ───────────────────────────────────────────────────────────
  function captureFiles(incoming: File[]) {
    // Allow appending more files, instead of slicing/replacing
    setIsProcessing(true);
    buildPreviewItemsForFiles(incoming, createdUrlsRef.current)
      .then(newItems => {
        setPreviewItems(prev => {
          const startIndex = prev.length;
          const next = [...prev, ...newItems];
          if (prev.length === 0 && next.length > 0) {
            unlockStep(1); //unlock step 1 (preview) after successful file capture
          }

          setSelectedPages(prevSel => {
            const nextSel = new Set(prevSel);
            newItems.forEach((item, i) => {
              if (item.hasFile) nextSel.add(startIndex + i);
            });
            return nextSel;
          });

          return next;
        });

      })
      .finally(() => {
        setIsProcessing(false);
      });
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

  // ── Remove file from queue ───────────────────────────────────────────────────
  function handleRemovePreview(previewIndex: number) {
    setPreviewItems((prev) => {
      const next = [...prev];
      next.splice(previewIndex, 1);

      if (next.length === 0) navigate('/', { replace: true });
      setSelectedPages(prevSel => {
        const nextSel = new Set<number>();
        for (const idx of prevSel) {
          if (idx < previewIndex) nextSel.add(idx);
          else if (idx > previewIndex) nextSel.add(idx - 1);
        }
        return nextSel;
      });

      return next;
    });
  }

  // ── Bulk remove from queue ───────────────────────────────────────────
  // Step 1: user clicks "Remove Selected" in the sidebar → just opens the
  // confirmation modal with the sorted indices, nothing is deleted yet.
  function requestBulkRemove() {
    if (selectedPages.size === 0) return;
    setRemoveConfirm([...selectedPages].sort((a, b) => a - b));
  }

  // Step 2: user confirms in the modal → actually remove all selected pages
  // at once and clear the selection.
  function confirmBulkRemove() {
    if (!removeConfirm) return;
    const toRemove = new Set(removeConfirm);
    setRemoveConfirm(null);

    setPreviewItems((prev) => {
      const next = prev.filter((_, idx) => !toRemove.has(idx));
      if (next.length === 0) navigate('/', { replace: true });
      return next;
    });
    setSelectedPages(new Set());
  }

  // ── Replace with file ───────────────────────────────────────────────────────
  function handleReplaceWithFile(previewIndex: number, picked: File) {
    const transfer = new DataTransfer();
    transfer.items.add(picked);
    const valid = filterValidFiles(transfer.files);
    if (valid.length === 0) {
      setUploadError(
        'This file type is not supported. Use JPG, PNG, PDF, HEIC, HEIF, or TIFF.',
      );
      return;
    }
    const checked = valid[0];
    const { accepted, rejected } = partitionBySize([checked]);
    if (rejected.length > 0) {
      setUploadError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    const newFile = accepted[0];

    const item = previewItemsRef.current[previewIndex];
    if (!item?.hasFile) return;

    const itemTitle = item.subtitle ? `${item.label} (${item.subtitle})` : item.label;
    setReplaceConfirm({ previewIndex, newFile, itemTitle });
  }

  function confirmReplace() {
    if (!replaceConfirm) return;
    const { previewIndex, newFile } = replaceConfirm;
    setReplaceConfirm(null);

    setIsProcessing(true);
    buildPreviewItemsForFiles([newFile], createdUrlsRef.current)
      .then(newItems => {
        setPreviewItems(prev => {
          const next = [...prev];
          next.splice(previewIndex, 1, ...newItems);

          setSelectedPages(prevSel => {
            const nextSel = new Set<number>();
            const shift = newItems.length - 1;

            for (const idx of prevSel) {
              if (idx < previewIndex) {
                nextSel.add(idx);
              } else if (idx > previewIndex) {
                nextSel.add(idx + shift);
              }
            }

            newItems.forEach((item, i) => {
              if (item.hasFile) nextSel.add(previewIndex + i);
            });
            return nextSel;
          });

          return next;
        });
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  // ── Bulk replace with files ──────────────────────────────────────────
  // Step 1: user clicks "Replace Selected" and picks files via the native
  // multi-file input. We require exactly one file per selected page, validate
  // type/size for all of them, then pair each file with a selected page
  // (sorted ascending) in the order the files were picked. Nothing is applied
  // yet — this just builds the confirmation list.
  function handleBulkReplaceFiles(pickedFiles: File[]) {
    const selectedIndices = [...selectedPages].sort((a, b) => a - b);
    if (selectedIndices.length === 0) return;

    if (pickedFiles.length !== selectedIndices.length) {
      setUploadError(
        `You selected ${selectedIndices.length} page(s) but chose ${pickedFiles.length} file(s). Pick exactly one file per selected page.`
      );
      return;
    }

    const transfer = new DataTransfer();
    pickedFiles.forEach((f) => transfer.items.add(f));
    const valid = filterValidFiles(transfer.files);
    if (valid.length !== pickedFiles.length) {
      setUploadError('One or more files have an unsupported type. Use JPG, PNG, PDF, HEIC, HEIF, or TIFF.');
      return;
    }
    const { accepted, rejected } = partitionBySize(valid);
    if (rejected.length > 0) {
      setUploadError(`One or more files are too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    const pairs = selectedIndices.map((previewIndex, i) => {
      const item = previewItemsRef.current[previewIndex];
      const itemTitle = item?.subtitle ? `${item.label} (${item.subtitle})` : item?.label ?? `Page ${previewIndex + 1}`;
      return { previewIndex, newFile: accepted[i], itemTitle };
    });

    setBulkReplaceConfirm(pairs);
  }

  // Step 2: user confirms in the modal → build preview items for every new
  // file, then splice them into previewItems from the highest index down to
  // the lowest so earlier splices don't shift the indices we still need to use.
  function confirmBulkReplace() {
    if (!bulkReplaceConfirm) return;
    const pairs = bulkReplaceConfirm;
    setBulkReplaceConfirm(null);

    setIsProcessing(true);
    Promise.all(
      pairs.map((pair) => buildPreviewItemsForFiles([pair.newFile], createdUrlsRef.current))
    )
      .then((allNewItems) => {
        setPreviewItems((prev) => {
          const next = [...prev];
          [...pairs].reverse().forEach((pair, i) => {
            const newItems = allNewItems[pairs.length - 1 - i];
            next.splice(pair.previewIndex, 1, ...newItems);
          });
          return next;
        });
        setSelectedPages(new Set());
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  // ── Process: send selected pages to OCR backend, then navigate ─────────────
  async function handleProcess() {
    if (selectedPages.size === 0 || isProcessing) return;
    if (selectedPages.size > 1) {
      setUploadError(
        'Only one page can be processed at a time for the current milestone. Deselect the extra pages so exactly one is selected, then try again.'
      );
      return;
    }
    setIsProcessing(true);
    setUploadError(null);    // US-1.4: clear any previous error before retrying
    setUploadSuccess(false); // US-1.5: clear any previous success before retrying

    try {
      const selectedSrcs = [...selectedPages]
        .sort((a, b) => a - b)
        .map((i) => previewItems[i])
        .filter((item) => item?.previewSrc)
        .map((item) => item.previewSrc!);

      await uploadPagesToBackend(selectedSrcs);

      // US-1.5: detect successful upload and show success notification
      unlockStep(2);
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

  // Helper to render global notifications
  const renderNotification = () => {
    if (!uploadError && !uploadSuccess) return null;
    return (
      <div className="toast toast-top toast-center z-50 mt-16">
        {uploadError && (
          <div className="alert alert-error shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-bold">Error</h3>
              <div className="text-xs">{uploadError}</div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setUploadError(null)}>✕</button>
          </div>
        )}
        {uploadSuccess && (
          <div className="alert alert-success shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-bold">Success</h3>
              <div className="text-xs">Redirecting to validation...</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // No files yet → full-screen landing dropzone
  if (previewItems.length === 0) {
    return (
      <>
        {renderNotification()}
        <EmptyUploadView onFilesCaptured={captureFiles} onError={setUploadError} />
      </>
    );
  }

  // Files loaded → split layout: preview grid left, sidebar right
  return (
    <div className="bg-base-100 fixed top-[92px] inset-x-0 bottom-0 z-0 flex flex-col">


      <header className="bg-base-100 text-base-content flex h-12 shrink-0 items-center px-6 text-xl font-extrabold border-b border-base-300">
        Preview
      </header>

      {/* Global Notifications */}
      {renderNotification()}

      {/* Replace Confirmation Modal */}
      {replaceConfirm && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Replace Page</h3>
            <p className="py-4">
              Are you sure you want to replace page <strong>{replaceConfirm.itemTitle}</strong> with <strong>{replaceConfirm.newFile.name}</strong>?
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setReplaceConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmReplace}>Replace</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Remove Confirmation Modal */}
      {removeConfirm && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Remove Pages</h3>
            <p className="py-4">
              Are you sure you want to remove <strong>{removeConfirm.length}</strong> selected page(s)? This cannot be undone.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setRemoveConfirm(null)}>Cancel</button>
              <button className="btn btn-error" onClick={confirmBulkRemove}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Replace Confirmation Modal */}
      {bulkReplaceConfirm && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Replace Pages</h3>
            <ul className="py-4 text-sm space-y-1">
              {bulkReplaceConfirm.map((pair) => (
                <li key={pair.previewIndex}>
                  <strong>{pair.itemTitle}</strong> → {pair.newFile.name}
                </li>
              ))}
            </ul>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setBulkReplaceConfirm(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmBulkReplace}>Replace</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">

        {/* Preview grid */}
        <main className="bg-base-100 flex-1 overflow-y-auto p-5">
          <div className="grid auto-rows-auto grid-cols-[repeat(auto-fill,minmax(200px,1fr))] content-start gap-[18px]">
            {previewItems.map((item, index) => (
              <PreviewCard
                key={`${item.label}-${item.subtitle ?? ""}-${index}`}
                label={item.label}
                subtitle={item.subtitle}
                hasFile={item.hasFile}
                index={index}
                isSelected={selectedPages.has(index)}
                previewSrc={item.previewSrc}
                isImage={item.isImage}
                isBlurry={item.isBlurry}
                isDark={item.isDark}
                shouldWarn={item.shouldWarn}
                onToggle={togglePageSelection}
                onRemove={handleRemovePreview}
                onReplaceWithFile={handleReplaceWithFile}
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
          onError={setUploadError}
          onBulkRemove={requestBulkRemove}           
          onBulkReplaceFiles={handleBulkReplaceFiles} 
        />

      </div>
    </div>
  );
}

export default UploadPage;