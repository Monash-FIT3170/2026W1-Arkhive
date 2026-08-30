// UploadPage is the orchestrator: it owns state, effects, and handlers.
// All UI is delegated to focused child components.
//
// To change the empty-state look  →  edit EmptyUploadView.tsx
// To change the sidebar           →  edit UploadSidebar.tsx
// To change PDF/canvas logic      →  edit components/preview/previewHelpers.ts
// To change the preview cards     →  edit components/preview/PreviewCard.tsx
//
// UPDATED: Preview grid is now grouped into per-file sections (see "groups"
// below) instead of one flat grid mixing pages from every file together.

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
import {
  uploadPageToBackend,
  deletePageFromBackend,
  processDocuments,
  getUploadedDocuments,
  getProcessedImageUrls,
} from '../../services/uploadService';
import ClassificationModal from './components/ClassificationModal';

export default function UploadPage() {
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
    status: string;
  } | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
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

  // tracks indices of previewItems that need their type assigned
  const [pendingClassificationIndices, setPendingClassificationIndices] = useState<number[] | null>(
    null
  );

  // Refs
  const previewItemsRef = useRef<PreviewItem[]>([]);
  const createdUrlsRef = useRef<string[]>([]);

  // NEW: tracks the next globally-unique fileIndex to hand out. Needed because
  // buildPreviewItemsForFiles now takes an offset instead of always starting
  // at 0, so pages added/replaced later don't collide with existing file groups.
  const nextFileIndexRef = useRef(0);
  const nextPageIndexRef = useRef(0);
  const sessionIdSuffixRef = useRef(`${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);

  useEffect(() => {
    previewItemsRef.current = previewItems;
  }, [previewItems]);

  useEffect(() => {
    if (previewItems.length > 0) {
      navigate('/?step=preview', { replace: true });
    } else {
      // Reset counters so the next files start from 1 again, keeping the UI numbering simple!
      nextFileIndexRef.current = 0;
      nextPageIndexRef.current = 0;
    }
  }, [previewItems, navigate]);

  // Clean up object URLs when leaving the page
  useEffect(() => {
    return () => {
      createdUrlsRef.current.forEach(URL.revokeObjectURL);
    };
  }, []);

  // Hydrate session on mount: fetch already uploaded documents from the backend
  useEffect(() => {
    let isMounted = true;
    Promise.all([getUploadedDocuments(), getProcessedImageUrls()])
      .then(([docs, processedUrls]) => {
        if (!isMounted || docs.length === 0) return;

        const processedSet = new Set(processedUrls);
        const hydratedItems: PreviewItem[] = [];
        docs.forEach((doc, fileIdx) => {
          doc.pages.forEach((pageUrl) => {
            const parts = pageUrl.split('/');
            const backendPageIndex = parseInt(parts[parts.length - 1], 10);

            hydratedItems.push({
              label: doc.label || `Session File ${fileIdx + 1}`,
              subtitle: `Page ${backendPageIndex + 1}`,
              previewSrc: pageUrl,
              isImage: true,
              hasFile: true,
              fileIndex: fileIdx,
              documentType: doc.type || 'Other',
              backendPageIndex,
              documentId: doc.documentId,
              isProcessed: processedSet.has(pageUrl),
            });

            nextFileIndexRef.current = Math.max(nextFileIndexRef.current, fileIdx + 1);
            nextPageIndexRef.current = Math.max(nextPageIndexRef.current, backendPageIndex + 1);
          });
        });

        if (hydratedItems.length > 0) {
          setPreviewItems((prev) => (prev.length === 0 ? hydratedItems : prev));
          unlockStep(1);
        }
      })
      .catch((err) => {
        console.error('Failed to hydrate session documents', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // ── File capture ───────────────────────────────────────────────────────────
  function captureFiles(incoming: File[]) {
    // Allow appending more files, instead of slicing/replacing
    setIsProcessing(true);
    const offset = nextFileIndexRef.current; // NEW
    buildPreviewItemsForFiles(incoming, createdUrlsRef.current, offset) // NEW: pass offset
      .then((newItems) => {
        nextFileIndexRef.current = offset + incoming.length; // NEW: advance the counter
        // Enhance items with stable ID and documentId first
        const enhancedItems = newItems.map((item) => {
          const backendPageIndex = nextPageIndexRef.current++;
          const documentId = `File_${item.fileIndex}_${sessionIdSuffixRef.current}`;
          return { ...item, backendPageIndex, documentId };
        });

        // Trigger the uploads OUTSIDE the state setter sequentially to prevent session race conditions!
        (async () => {
          for (const item of enhancedItems) {
            if (item.hasFile && item.previewSrc) {
              try {
                await uploadPageToBackend(
                  item.previewSrc,
                  item.documentId!,
                  item.backendPageIndex!,
                  item.label,
                  item.documentType
                );
              } catch (err) {
                console.error('Background upload failed:', err);
              }
            }
          }
        })();

        setPreviewItems((prev) => {
          const startIndex = prev.length;
          const next = [...prev, ...enhancedItems];
          if (prev.length === 0 && next.length > 0) {
            unlockStep(1); //unlock step 1 (preview) after successful file capture
          }

          // queue classification for the newly added items
          const newIndices = enhancedItems.map((_, i) => startIndex + i);
          setPendingClassificationIndices(newIndices);

          setSelectedPages((prevSel) => {
            const nextSel = new Set(prevSel);
            enhancedItems.forEach((item, i) => {
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
    if (previewItems[previewIndex]?.isProcessed) {
      // If processed, ask for confirmation to show the warning
      setRemoveConfirm([previewIndex]);
    } else {
      setPreviewItems((prev) => {
        const next = [...prev];
        const itemToRemove = next[previewIndex];
        next.splice(previewIndex, 1);

        if (
          itemToRemove?.hasFile &&
          itemToRemove.backendPageIndex !== undefined &&
          itemToRemove.documentId
        ) {
          deletePageFromBackend(itemToRemove.documentId, itemToRemove.backendPageIndex).catch(
            (err) => console.error('Failed to delete page from backend', err)
          );
        }

        if (next.length === 0) navigate('/', { replace: true });
        setSelectedPages((prevSel) => {
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
      const itemsToRemove = prev.filter((_, idx) => toRemove.has(idx));

      // Delete all from backend sequentially to prevent session race conditions
      (async () => {
        for (const item of itemsToRemove) {
          if (item.hasFile && item.backendPageIndex !== undefined && item.documentId) {
            try {
              await deletePageFromBackend(item.documentId, item.backendPageIndex);
            } catch (err) {
              console.error('Failed to delete page from backend', err);
            }
          }
        }
      })();

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
      setUploadError('This file type is not supported. Use JPG, PNG, PDF, HEIC, HEIF, or TIFF.');
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

    // Note: Reusing replaceConfirm for the warning is possible,
    // but the replacement modal is a bit different. Let's just allow it for now.

    const itemTitle = item.subtitle ? `${item.label} (${item.subtitle})` : item.label;
    setReplaceConfirm({ previewIndex, newFile, itemTitle });
  }

  function confirmReplace() {
    if (!replaceConfirm) return;
    const { previewIndex, newFile } = replaceConfirm;
    setReplaceConfirm(null);

    setIsProcessing(true);
    const offset = nextFileIndexRef.current; // NEW: replaced page(s) count as a new file group
    buildPreviewItemsForFiles([newFile], createdUrlsRef.current, offset) // NEW: pass offset
      .then((newItems) => {
        nextFileIndexRef.current = offset + 1; // NEW: advance the counter

        // Assign stable backend page index and start upload
        const enhancedItems = newItems.map((item) => {
          const backendPageIndex = nextPageIndexRef.current++;
          const documentId = `File_${item.fileIndex}_${sessionIdSuffixRef.current}`;
          return { ...item, backendPageIndex, documentId };
        });

        // Trigger the uploads OUTSIDE the state setter sequentially!
        (async () => {
          for (const item of enhancedItems) {
            if (item.hasFile && item.previewSrc) {
              try {
                await uploadPageToBackend(
                  item.previewSrc,
                  item.documentId!,
                  item.backendPageIndex!,
                  item.label,
                  item.documentType
                );
              } catch (err) {
                console.error('Background upload failed:', err);
              }
            }
          }
        })();

        setPreviewItems((prev) => {
          const next = [...prev];

          const itemToRemove = next[previewIndex];
          if (
            itemToRemove?.hasFile &&
            itemToRemove.backendPageIndex !== undefined &&
            itemToRemove.documentId
          ) {
            deletePageFromBackend(itemToRemove.documentId, itemToRemove.backendPageIndex).catch(
              (err) => console.error('Failed to delete page from backend', err)
            );
          }

          next.splice(previewIndex, 1, ...enhancedItems);

          const newIndices = enhancedItems.map((_, i) => previewIndex + i);
          // Set pending classification immediately for this replace
          setTimeout(() => setPendingClassificationIndices(newIndices), 0);

          setSelectedPages((prevSel) => {
            const nextSel = new Set<number>();
            const shift = enhancedItems.length - 1;

            for (const idx of prevSel) {
              if (idx < previewIndex) {
                nextSel.add(idx);
              } else if (idx > previewIndex) {
                nextSel.add(idx + shift);
              }
            }

            enhancedItems.forEach((item, i) => {
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
      setUploadError(
        'One or more files have an unsupported type. Use JPG, PNG, PDF, HEIC, HEIF, or TIFF.'
      );
      return;
    }
    const { accepted, rejected } = partitionBySize(valid);
    if (rejected.length > 0) {
      setUploadError(`One or more files are too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }

    const pairs = selectedIndices.map((previewIndex, i) => {
      const item = previewItemsRef.current[previewIndex];
      const itemTitle = item?.subtitle
        ? `${item.label} (${item.subtitle})`
        : (item?.label ?? `Page ${previewIndex + 1}`);
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
    const startOffset = nextFileIndexRef.current; // NEW: each replaced page becomes its own new file group
    nextFileIndexRef.current = startOffset + pairs.length; // NEW: advance the counter up front
    Promise.all(
      pairs.map((pair, i) =>
        buildPreviewItemsForFiles([pair.newFile], createdUrlsRef.current, startOffset + i)
      ) // NEW: pass unique offset per pair
    )
      .then((allNewItems) => {
        // Pre-process all items outside the state setter
        const enhancedAllItems = allNewItems.map((newItemsGroup) =>
          newItemsGroup.map((item) => {
            const backendPageIndex = nextPageIndexRef.current++;
            const documentId = `File_${item.fileIndex}_${sessionIdSuffixRef.current}`;
            return { ...item, backendPageIndex, documentId };
          })
        );

        // Upload new items outside the state setter sequentially!
        (async () => {
          for (const group of enhancedAllItems) {
            for (const item of group) {
              if (item.hasFile && item.previewSrc) {
                try {
                  await uploadPageToBackend(
                    item.previewSrc,
                    item.documentId!,
                    item.backendPageIndex!,
                    item.label,
                    item.documentType
                  );
                } catch (err) {
                  console.error('Background upload failed:', err);
                }
              }
            }
          }
        })();

        setPreviewItems((prev) => {
          const next = [...prev];
          const newIndices: number[] = [];

          [...pairs].reverse().forEach((pair, i) => {
            const itemToRemove = next[pair.previewIndex];
            if (
              itemToRemove?.hasFile &&
              itemToRemove.backendPageIndex !== undefined &&
              itemToRemove.documentId
            ) {
              deletePageFromBackend(itemToRemove.documentId, itemToRemove.backendPageIndex).catch(
                (err) => console.error('Failed to delete page from backend', err)
              );
            }

            const enhancedItems = enhancedAllItems[pairs.length - 1 - i];

            next.splice(pair.previewIndex, 1, ...enhancedItems);
            enhancedItems.forEach((_, idx) => newIndices.push(pair.previewIndex + idx));
          });

          setTimeout(() => setPendingClassificationIndices(newIndices.sort((a, b) => a - b)), 0);
          return next;
        });
        setSelectedPages(new Set());
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }

  // ── Change Type ────────────────────────────────────────────────────────────
  function requestBulkChangeType() {
    if (selectedPages.size === 0) return;
    setPendingClassificationIndices([...selectedPages].sort((a, b) => a - b));
  }

  function handleChangeType(index: number) {
    setPendingClassificationIndices([index]);
  }

  function handleClassificationComplete(updates: { index: number; documentType: string }[]) {
    setPreviewItems((prev) => {
      const next = [...prev];
      updates.forEach(({ index, documentType }) => {
        if (next[index]) {
          next[index] = { ...next[index], documentType };
        }
      });
      return next;
    });
    setPendingClassificationIndices(null);
  }

  function handleClassificationCancel() {
    if (!pendingClassificationIndices) return;

    setPreviewItems((prev) => {
      const next = [...prev];
      pendingClassificationIndices.forEach((index) => {
        // If a document doesn't have a type yet, default to 'Other'
        if (next[index] && !next[index].documentType) {
          next[index] = { ...next[index], documentType: 'Other' };
        }
      });
      return next;
    });
    setPendingClassificationIndices(null);
  }

  // ── Process: send selected pages to OCR backend in batch, then navigate ────
  async function handleProcess() {
    if (selectedPages.size === 0 || isProcessing) return;
    setIsProcessing(true);
    setUploadError(null); // US-1.4: clear any previous error before retrying
    setRetryMessage(null);
    setBatchProgress(null);
    setUploadSuccess(false); // US-1.5: clear any previous success before retrying

    try {
      const selectedItemsMap = new Map<string, { type: string; pages: string[] }>();

      const sortedSelectedIndices = [...selectedPages].sort((a, b) => a - b);

      sortedSelectedIndices.forEach((index) => {
        const item = previewItems[index];
        if (item?.hasFile && item.backendPageIndex !== undefined && item.documentId) {
          const docId = item.documentId;
          if (!selectedItemsMap.has(docId)) {
            selectedItemsMap.set(docId, { type: item.documentType || 'Other', pages: [] });
          }
          selectedItemsMap.get(docId)!.pages.push(item.backendPageIndex.toString());
        }
      });

      const selectedPayload = Array.from(selectedItemsMap.entries()).map(([documentId, data]) => ({
        documentId,
        type: data.type,
        pages: data.pages,
      }));

      await processDocuments(selectedPayload, (msg) => {
        setRetryMessage(msg);
      });

      setPreviewItems((prev) => {
        const next = [...prev];
        [...selectedPages].forEach((index) => {
          if (next[index]) next[index] = { ...next[index], isProcessed: true };
        });
        return next;
      });

      // US-1.5: detect successful upload and show success notification
      unlockStep(2);
      setUploadSuccess(true);
      setTimeout(() => {
        navigate('/validation');
      }, 1200);
    } catch (err) {
      // US-1.4: store error message in state to display near upload area
      const message =
        err instanceof Error ? err.message : 'An unexpected error occurred during processing.';
      setUploadError(message);
      setRetryMessage(null); // Clear retry message when error is shown
      console.error('Processing failed:', err);
    } finally {
      setIsProcessing(false);
    }
  }

  // Helper to render global notifications
  const renderNotification = () => {
    if (!uploadError && !uploadSuccess && !retryMessage) return null;
    return (
      <div className="toast toast-top toast-center z-50 mt-16">
        {uploadError && (
          <div className="alert alert-error shadow-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h3 className="font-bold">Error</h3>
              <div className="text-xs">{uploadError}</div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => setUploadError(null)}>
              ✕
            </button>
          </div>
        )}
        {retryMessage && (
          <div className="alert alert-warning mb-2 p-3 text-sm rounded-xl flex items-start gap-2 shadow-lg max-w-sm">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="mt-0.5 h-4 w-4 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div className="flex-1">
              <span>{retryMessage}</span>
            </div>
            <button className="btn btn-xs btn-ghost" onClick={() => setRetryMessage(null)}>
              ✕
            </button>
          </div>
        )}
        {uploadSuccess && (
          <div className="alert alert-success shadow-lg">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
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

  // NEW: group previewItems by fileIndex, preserving the order each group
  // first appears in. Each group renders as its own labeled section with
  // its pages laid out in a horizontal row (see mockup: "File 1 / File 2 / File 3").
  const groups = useMemo(() => {
    const map = new Map<number, { originalIndex: number; item: PreviewItem }[]>();
    previewItems.forEach((item, index) => {
      const key = item.fileIndex ?? index; // fallback keeps placeholders/ungrouped items separate
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ originalIndex: index, item });
    });
    return Array.from(map.entries()).map(([fileIndex, entries], groupPos) => ({
      fileIndex,
      groupNumber: groupPos + 1,
      entries,
    }));
  }, [previewItems]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // No files yet → full-screen landing dropzone
  if (previewItems.length === 0) {
    return (
      <>
        {renderNotification()}
        {pendingClassificationIndices && pendingClassificationIndices.length > 0 && (
          <ClassificationModal
            items={pendingClassificationIndices.map((index) => ({
              index,
              item: previewItems[index],
            }))}
            onComplete={handleClassificationComplete}
            onCancel={handleClassificationCancel}
          />
        )}
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
              {previewItems[replaceConfirm.previewIndex]?.isProcessed ? (
                <>
                  <strong className="text-warning">Warning:</strong> The page you are replacing has
                  already been <strong>processed</strong>. Replacing it will cause the Validation
                  page to lose its corresponding image context.
                  <br />
                  <br />
                  Are you sure you want to replace page <strong>
                    {replaceConfirm.itemTitle}
                  </strong>{' '}
                  with <strong>{replaceConfirm.newFile.name}</strong>?
                </>
              ) : (
                <>
                  Are you sure you want to replace page <strong>{replaceConfirm.itemTitle}</strong>{' '}
                  with <strong>{replaceConfirm.newFile.name}</strong>?
                </>
              )}
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setReplaceConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmReplace}>
                Replace
              </button>
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
              {removeConfirm.some((idx) => previewItems[idx]?.isProcessed) ? (
                <>
                  <strong className="text-warning">Warning:</strong> You are removing{' '}
                  <strong>{removeConfirm.length}</strong> selected page(s), some of which have
                  already been <strong>processed</strong>. Removing them will cause the Validation
                  page to lose its corresponding image context.
                  <br />
                  <br />
                  Are you sure you want to proceed?
                </>
              ) : (
                <>
                  Are you sure you want to remove <strong>{removeConfirm.length}</strong> selected
                  page(s)? This cannot be undone.
                </>
              )}
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setRemoveConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-error" onClick={confirmBulkRemove}>
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Replace Confirmation Modal */}
      {bulkReplaceConfirm && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Replace Pages</h3>

            {bulkReplaceConfirm.some((pair) => previewItems[pair.previewIndex]?.isProcessed) && (
              <p className="pt-4 pb-2 text-warning">
                <strong>Warning:</strong> You are replacing selected page(s), some of which have
                already been <strong>processed</strong>. Replacing them will cause the Validation
                page to lose its corresponding image context.
              </p>
            )}

            <ul className="py-2 text-sm space-y-1">
              {bulkReplaceConfirm.map((pair) => (
                <li key={pair.previewIndex}>
                  <strong>{pair.itemTitle}</strong> → {pair.newFile.name}
                </li>
              ))}
            </ul>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setBulkReplaceConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={confirmBulkReplace}>
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Classification Modal */}
      {pendingClassificationIndices && pendingClassificationIndices.length > 0 && (
        <ClassificationModal
          items={pendingClassificationIndices.map((index) => ({
            index,
            item: previewItems[index],
          }))}
          onComplete={handleClassificationComplete}
          onCancel={handleClassificationCancel}
        />
      )}

      <div className="flex min-h-0 flex-1">
        {/* Preview grid — UPDATED: now grouped into per-file sections instead
            of one flat grid. Each section is its own labeled box (e.g. "File 1")
            with that file's pages laid out in a horizontal, wrapping row. */}
        <main className="bg-base-100 flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section
                key={group.fileIndex}
                className="rounded-lg border border-base-300 bg-base-200/40 p-4"
              >
                <h3 className="mb-3 text-sm font-semibold text-base-content/70">
                  File {group.groupNumber}
                  {group.entries[0]?.item.label && (
                    <span className="ml-2 font-normal text-base-content/50">
                      — {group.entries[0].item.label}
                    </span>
                  )}
                </h3>
                <div className="flex flex-wrap gap-[18px]">
                  {group.entries.map(({ item, originalIndex }) => (
                    <div
                      key={`${item.label}-${item.subtitle ?? ''}-${originalIndex}`}
                      className="w-[200px] shrink-0"
                    >
                      <PreviewCard
                        label={item.label}
                        subtitle={item.subtitle}
                        hasFile={item.hasFile}
                        index={originalIndex}
                        isSelected={selectedPages.has(originalIndex)}
                        previewSrc={item.previewSrc}
                        isImage={item.isImage}
                        isBlurry={item.isBlurry}
                        isDark={item.isDark}
                        shouldWarn={item.shouldWarn}
                        isProcessed={item.isProcessed}
                        documentType={item.documentType}
                        onToggle={togglePageSelection}
                        onRemove={handleRemovePreview}
                        onReplaceWithFile={handleReplaceWithFile}
                        onChangeType={handleChangeType}
                      />
                    </div>
                  ))}
                </div>
              </section>
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
          onBulkChangeType={requestBulkChangeType}
        />
      </div>
    </div>
  );
}
