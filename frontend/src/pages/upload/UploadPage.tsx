// UploadPage is the orchestrator: it owns state, effects, and handlers.
// All UI is delegated to focused child components.
//
// To change the empty-state look  →  edit EmptyUploadView.tsx
// To change PDF/canvas logic      →  edit components/preview/previewHelpers.ts
// To change the preview cards     →  edit components/preview/PreviewCard.tsx
//
// Loaded-state layout (toolbar + grouped preview grid) is shared with
// ProjectWorkspacePage's Files view via PageToolbar/PageGroupSection/
// PreviewCard — each page adapts its own data (preview items vs.
// documents/pages) into those components' generic props, the same way
// ValidationPage/ProjectWorkspacePage adapt into <ValidationWorkspace>.

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, RefreshCw } from 'lucide-react';
import { unlockStep } from '../../services/stepGuard.ts';

import type { PreviewItem } from './types';
import { buildPreviewItemsForFiles } from './components/preview/previewHelpers';
import EmptyUploadView from './components/EmptyUploadView';
import UploadMoreButton from './components/actions/UploadMoreButton';
import ScanQrButton from './components/actions/ScanQrButton';
import PreviewCard from './components/preview/PreviewCard';
import PageToolbar, { type ToolbarAction } from './components/preview/PageToolbar';
import PageGroupSection from './components/preview/PageGroupSection';
import Toast from '../validation/components/modals/Toast';
import {
  filterValidFiles,
  partitionBySize,
  MAX_FILE_SIZE_MB,
} from '../../pages/upload/components/dropzone/dropZoneUtils';
import {
  uploadPageToBackend,
  deletePageFromBackend,
  processDocuments,
  getUploadedDocuments,
  getProcessedImageUrls,
  getJobs,
} from '../../services/uploadService';

import { ErrorBoundary } from './ErrorBoundary';

function UploadPageInner() {
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  // const [batchProgress, setBatchProgress] = useState<{
  //   current: number;
  //   total: number;
  //   fileName: string;
  //   status: string;
  // } | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState<{
    previewIndex: number;
    newFile: File;
    itemTitle: string;
  } | null>(null);
  const [processConfirmWarning, setProcessConfirmWarning] = useState<boolean>(false);

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
  const bulkReplaceInputRef = useRef<HTMLInputElement>(null);

  // Tracks the next globally-unique fileIndex for preview items
  const nextFileIndexRef = useRef(0);
  const nextPageIndexRef = useRef(0);
  const [sessionIdSuffix] = useState(() => `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
  useEffect(() => {
    previewItemsRef.current = previewItems;
  }, [previewItems]);

  useEffect(() => {
    if (previewItems.length > 0) {
      navigate('/upload?step=preview', { replace: true });
    } else {
      // Reset counters so the next files start from 1 again
      nextFileIndexRef.current = 0;
      nextPageIndexRef.current = 0;
    }
  }, [previewItems, navigate]);

  // Clean up object URLs when leaving the page
  useEffect(() => {
    const urlsToRevoke = createdUrlsRef.current;
    return () => {
      urlsToRevoke.forEach(URL.revokeObjectURL);
    };
  }, []);

  // Hydrate session on mount: fetch already uploaded documents from the backend
  useEffect(() => {
    let isMounted = true;
    Promise.all([getUploadedDocuments(), getProcessedImageUrls(), getJobs().catch(() => ({ jobs: [] }))])
      .then(([docs, processedUrls, jobsResponse]) => {
        if (!isMounted || docs.length === 0) return;

        const processedSet = new Set(processedUrls);
        const jobs = jobsResponse.jobs || [];
        const hydratedItems: PreviewItem[] = [];

        docs.forEach((doc, fileIdx) => {
          doc.pages.forEach((pageObj) => {
            const pageUrl = typeof pageObj === 'string' ? pageObj : pageObj.url;
            const qualityFlags = typeof pageObj === 'object' ? pageObj.qualityFlags : undefined;
            const parts = pageUrl.split('/');
            const backendPageIndex = parseInt(parts[parts.length - 1], 10);

            const job = jobs.find((j: any) => j.imageUrl === pageUrl);
            const isFailed = job?.status === 'failed';

            hydratedItems.push({
              label: doc.label || `Session File ${fileIdx + 1}`,
              subtitle: `Page ${backendPageIndex + 1}`,
              previewSrc: pageUrl,
              isImage: true,
              hasFile: true,
              fileIndex: fileIdx,
              backendPageIndex,
              documentId: doc.documentId,
              isProcessed: isFailed ? false : processedSet.has(pageUrl),
              errorText: isFailed ? job.errorMessage : undefined,
              isBlurry: qualityFlags?.isBlurry,
              isDark: qualityFlags?.isDark,
              isInvalidSize: qualityFlags?.isInvalidSize,
              shouldWarn: qualityFlags?.shouldWarn,
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
          const documentId = `File_${item.fileIndex}_${sessionIdSuffix}`;
          return { ...item, backendPageIndex, documentId };
        });

        // Trigger the uploads OUTSIDE the state setter sequentially to prevent session race conditions!
        (async () => {
          for (const item of enhancedItems) {
            if (item.hasFile && item.previewSrc) {
              try {
                const result = await uploadPageToBackend(
                  item.previewSrc,
                  item.documentId!,
                  item.backendPageIndex!,
                  item.label
                );
                
                // Update the preview item with the quality flags from the backend
                setPreviewItems((prev) => 
                  prev.map((p) => 
                    p.documentId === item.documentId && p.backendPageIndex === item.backendPageIndex 
                      ? { 
                          ...p, 
                          isBlurry: result.qualityFlags.isBlurry,
                          isDark: result.qualityFlags.isDark,
                          isInvalidSize: result.qualityFlags.isInvalidSize,
                          shouldWarn: result.qualityFlags.shouldWarn
                        } 
                      : p
                  )
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
  // ── QR (phone) upload ──────────────────────────────────────────────────────
  // NEW: Called by ScanQrButton once the phone's photo has landed in the session.
  // Re-fetches the session's documents and adds any we aren't already showing,
  // mirroring what the hydrate-on-mount effect does. Phone uploads arrive as a
  // brand-new document, same as a fresh desktop upload.
  async function handleQrUploaded() {
    try {
      const docs = await getUploadedDocuments();
      const knownIds = new Set(previewItemsRef.current.map((item) => item.documentId));

      const newItems: PreviewItem[] = [];
      docs.forEach((doc) => {
        if (knownIds.has(doc.documentId)) return;

        const fileIndex = nextFileIndexRef.current++;
        doc.pages.forEach((pageObj) => {
          const pageUrlStr = typeof pageObj === 'string' ? pageObj : pageObj.url;
          const qualityFlags = typeof pageObj === 'object' ? pageObj.qualityFlags : undefined;
          const parts = pageUrlStr.split('/');
          const backendPageIndex = parseInt(parts[parts.length - 1], 10);

          newItems.push({
            label: doc.label || `Mobile Upload ${fileIndex + 1}`,
            subtitle: `Page ${backendPageIndex + 1}`,
            previewSrc: pageUrlStr,
            isImage: true,
            hasFile: true,
            fileIndex,
            backendPageIndex,
            documentId: doc.documentId,
            isProcessed: false,
            isBlurry: qualityFlags?.isBlurry,
            isDark: qualityFlags?.isDark,
            isInvalidSize: qualityFlags?.isInvalidSize,
            shouldWarn: qualityFlags?.shouldWarn,
          });
        });
      });

      if (newItems.length === 0) return;

      setPreviewItems((prev) => {
        const startIndex = prev.length;
        const next = [...prev, ...newItems];
        if (prev.length === 0) {
          unlockStep(1); // unlock step 1 (preview) after the first successful capture
        }

        // Select the new pages by default, like captureFiles does
        setSelectedPages((prevSel) => {
          const nextSel = new Set(prevSel);
          newItems.forEach((item, i) => {
            if (item.hasFile) nextSel.add(startIndex + i);
          });
          return nextSel;
        });

        return next;
      });
      // explicitly go to the preview screen once the QR photo has landed,
      // instead of relying only on the previewItems-watching effect.
      setTimeout(() => {
        navigate('/upload?step=preview', { replace: true });
      }, 1500);

    } catch (err) {
      console.error('Failed to refresh documents after QR upload', err);
      setUploadError('Your photo was uploaded, but the page could not be refreshed. Please reload.');
    }
  }
  // ── Page selection ─────────────────────────────────────────────────────────
  function togglePageSelection(index: number) {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
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

        if (next.length === 0) navigate('/upload', { replace: true });
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
      if (next.length === 0) navigate('/upload', { replace: true });
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
          const documentId = `File_${item.fileIndex}_${sessionIdSuffix}`;
          return { ...item, backendPageIndex, documentId };
        });

        // Trigger the uploads OUTSIDE the state setter sequentially!
        (async () => {
          for (const item of enhancedItems) {
            if (item.hasFile && item.previewSrc) {
              try {
                const result = await uploadPageToBackend(
                  item.previewSrc,
                  item.documentId!,
                  item.backendPageIndex!,
                  item.label
                );
                
                // Update the preview item with the quality flags from the backend
                setPreviewItems((prev) => 
                  prev.map((p) => 
                    p.documentId === item.documentId && p.backendPageIndex === item.backendPageIndex 
                      ? { 
                          ...p, 
                          isBlurry: result.qualityFlags.isBlurry,
                          isDark: result.qualityFlags.isDark,
                          isInvalidSize: result.qualityFlags.isInvalidSize,
                          shouldWarn: result.qualityFlags.shouldWarn
                        } 
                      : p
                  )
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
            const documentId = `File_${item.fileIndex}_${sessionIdSuffix}`;
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
                    item.label
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
          });

          return next;
        });
        setSelectedPages(new Set());
      })
      .finally(() => {
        setIsProcessing(false);
      });
  }



  // ── Process: send selected pages to OCR backend in batch, then navigate ────
  function handleProcessClick() {
    if (selectedPages.size === 0 || isProcessing) return;
    
    // Check if any selected page has a warning flag
    const hasWarnings = [...selectedPages].some(index => previewItems[index]?.shouldWarn);
    
    if (hasWarnings) {
      setProcessConfirmWarning(true);
    } else {
      executeProcess();
    }
  }

  async function executeProcess() {
    setProcessConfirmWarning(false);
    setIsProcessing(true);
    setUploadError(null); // US-1.4: clear any previous error before retrying
    setRetryMessage(null);
    setUploadSuccess(false); // US-1.5: clear any previous success before retrying

    try {
      const selectedItemsMap = new Map<string, { pages: string[] }>();

      const sortedSelectedIndices = [...selectedPages].sort((a, b) => a - b);

      sortedSelectedIndices.forEach((index) => {
        const item = previewItems[index];
        if (item?.hasFile && item.backendPageIndex !== undefined && item.documentId) {
          const docId = item.documentId;
          if (!selectedItemsMap.has(docId)) {
            selectedItemsMap.set(docId, { pages: [] });
          }
          selectedItemsMap.get(docId)!.pages.push(item.backendPageIndex.toString());
        }
      });

      const selectedPayload = Array.from(selectedItemsMap.entries()).map(([documentId, data]) => ({
        documentId,
        pages: data.pages,
      }));

      const result = await processDocuments(selectedPayload, (msg) => {
        setRetryMessage(msg);
      });

      let allSucceeded = true;

      setPreviewItems((prev) => {
        const next = [...prev];
        [...selectedPages].forEach((index) => {
          if (next[index] && next[index].documentId !== undefined && next[index].backendPageIndex !== undefined) {
            // Find job result if it exists
            const job = result?.jobs?.find(j => 
               j.documentId === next[index].documentId
            );
            if (job && job.status === 'failed') {
               allSucceeded = false;
               next[index] = { ...next[index], isProcessed: false, errorText: job.errorMessage || 'Processing failed' };
            } else {
               next[index] = { ...next[index], isProcessed: true, errorText: undefined };
            }
          }
        });
        return next;
      });

      if (!allSucceeded) {
         setUploadError('Some files failed to process. Please review the errors on the items.');
         return;
      }

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
    if (uploadError) {
      return (
        <Toast
          open={true}
          message={uploadError}
          type="error"
          onDismiss={() => setUploadError(null)}
        />
      );
    }
    if (uploadSuccess) {
      return (
        <Toast
          open={true}
          message="Files successfully uploaded and processed! Redirecting to validation..."
          type="success"
          onDismiss={() => setUploadSuccess(false)}
        />
      );
    }
    if (retryMessage) {
      return (
        <Toast
          open={true}
          message={retryMessage}
          type="warning"
          onDismiss={() => setRetryMessage(null)}
        />
      );
    }
    return null;
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
        <EmptyUploadView onFilesCaptured={captureFiles} onError={setUploadError} onQrUploaded={handleQrUploaded} />
      </>
    );
  }

  const toolbarActions: ToolbarAction[] = [
    {
      key: 'replace',
      label: `Replace (${selectedPages.size})`,
      icon: <RefreshCw className="w-3.5 h-3.5" />,
      tone: 'outline',
      disabled: isProcessing,
      onClick: () => bulkReplaceInputRef.current?.click(),
    },
    {
      key: 'delete',
      label: `Delete (${selectedPages.size})`,
      icon: <Trash2 className="w-3.5 h-3.5" />,
      tone: 'error',
      disabled: isProcessing,
      onClick: requestBulkRemove,
    },
    {
      key: 'process',
      label: `Process (${selectedPages.size})`,
      tone: 'primary',
      disabled: isProcessing,
      isBusy: isProcessing,
      onClick: handleProcessClick,
    },
  ];

  // Files loaded → toolbar + full-width grouped preview grid
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

      {/* Hidden input for toolbar Replace action */}
      <input
        ref={bulkReplaceInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0) handleBulkReplaceFiles(files);
        }}
      />
      {processConfirmWarning && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-warning">Warning: Low Quality Images</h3>
            <p className="py-4 text-sm">
              You have selected images that are flagged for low quality (e.g. blurry, dark, or invalid size).
              Processing these images might produce poor or unexpected OCR results.
              Are you sure you want to continue?
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setProcessConfirmWarning(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={executeProcess}>
                Yes, process anyway
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={bulkReplaceInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".jpg,.jpeg,.png,.pdf,.heic,.heif,.tiff,.tif"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0) handleBulkReplaceFiles(files);
        }}
      />

      <PageToolbar
        selectedCount={selectedPages.size}
        onSelectAll={selectAllPages}
        onDeselectAll={deselectAllPages}
        actions={toolbarActions}
        trailing={
          <div className="flex items-center gap-2">
            <ScanQrButton onUploaded={handleQrUploaded} className="btn btn-outline btn-sm" />
            <div className="w-40">
              <UploadMoreButton onFilesSelected={captureFiles} onError={setUploadError} />
            </div>
          </div>
        }
      />

      {/* Preview grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <PageGroupSection
              key={group.fileIndex}
              label={group.entries[0]?.item.label ?? `File ${group.groupNumber}`}
            >
              {group.entries.map(({ item, originalIndex }, posInGroup) => {
                const caption = item.subtitle ?? `Page ${posInGroup + 1}`;
                return (
                  <PreviewCard
                    key={`${item.label}-${item.subtitle ?? ''}-${originalIndex}`}
                    title={item.subtitle ? `${item.label} - ${item.subtitle}` : item.label}
                    caption={caption}
                    isSelectable={item.hasFile}
                    isSelected={selectedPages.has(originalIndex)}
                    thumbnailUrl={item.previewSrc}
                    isImage={item.isImage}
                    status={{
                      text: item.errorText ? 'error' : item.isProcessed ? 'done' : 'pending',
                      className: item.errorText ? 'badge-error' : item.isProcessed ? 'badge-success' : 'badge-ghost',
                    }}
                    warningText={warningTextFor(item)}
                    errorText={item.errorText}
                    onToggle={() => togglePageSelection(originalIndex)}
                    onRemove={() => handleRemovePreview(originalIndex)}
                    onReplaceWithFile={(file) => handleReplaceWithFile(originalIndex, file)}
                  />
                );
              })}
            </PageGroupSection>
          ))}
        </div>
      </div>
    </div>
  );
}

function warningTextFor(item: PreviewItem): string | undefined {
  if (!item.shouldWarn) return undefined;
  if (item.isInvalidSize) return 'Invalid size';
  if (item.isBlurry && item.isDark) return 'Blurry and too dark';
  if (item.isBlurry) return 'Might be blurry';
  return 'Might be too dark';
}
export default function UploadPage() { return <ErrorBoundary><UploadPageInner /></ErrorBoundary>; }

