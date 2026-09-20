import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Trash2, Columns2 } from 'lucide-react';
import { getProject } from '../../services/projectService';
import {
  uploadPageToR2,
  getDownloadUrl,
  processPages,
  saveExtractedData,
  deletePage,
  deleteDocument,
} from '../../services/documentService';
import { buildPreviewItemsForFiles } from '../upload/components/preview/previewHelpers';
import EmptyUploadView from '../upload/components/EmptyUploadView';
import UploadMoreButton from '../upload/components/actions/UploadMoreButton';
import ValidationWorkspace from '../validation/components/ValidationWorkspace';
import { flatten } from '../../utils/flattener';
import type {
  ProjectDetail,
  DocumentRecord,
  PageStatus,
  PageSelection,
} from '../../models/Project';
import type { ExtractedPage } from '../../models/TableData';
import type { OCRComponent } from '../../models/OCRComponent';

// The OCR backend stores one page's result per document_pages row, but the
// real Azure/Gemini pipeline wraps it as `Pages` — [{ page_num, components }]
// — while the OCR_MODE=mock fixture returns a flat OCRComponent[] instead.
// Unwrap defensively so either shape renders correctly.
function extractComponents(raw: unknown): OCRComponent[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const first = raw[0] as any;
  if (first && typeof first === 'object' && Array.isArray(first.components)) {
    return first.components as OCRComponent[];
  }
  return raw as OCRComponent[];
}

// Project workspace: upload pages into the project, batch-process them with
// OCR, then validate/edit the extracted table per page. The validate mode
// renders <ValidationWorkspace>, the same component ValidationPage uses —
// this page's job is just knowing where the data comes from (documents/pages
// on the project) and where edits get saved (saveExtractedData, per page).
// Pages are flattened across all of the project's documents for validation
// (one continuous carousel).

function statusBadgeClass(status: PageStatus): string {
  switch (status) {
    case 'done':
      return 'badge-success';
    case 'processing':
      return 'badge-warning';
    case 'error':
      return 'badge-error';
    default:
      return 'badge-ghost';
  }
}

function pageKey(documentId: string, pageIndex: number): string {
  return `${documentId}:${pageIndex}`;
}

export default function ProjectWorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingKeys, setProcessingKeys] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [showReprocessConfirm, setShowReprocessConfirm] = useState(false);

  // Delete confirmation covers both a single hover-triggered card delete and
  // the toolbar's bulk "Delete Selected" action, sharing one modal/handler.
  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'single'; documentId: string; pageIndex: number } | { type: 'bulk' } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [mode, setMode] = useState<'files' | 'validate'>('files');

  const [imageUrlMap, setImageUrlMap] = useState<Record<string, string>>({});
  const createdUrlsRef = useRef<string[]>([]);

  // Keeps track of which (documentId, pageIndex) each index in the flat
  // pages array passed to <ValidationWorkspace> corresponds to, so
  // persistPages can save each edited page back to the right place.
  const validationListRef = useRef<typeof validationList>([]);
  const [hasEnteredValidate, setHasEnteredValidate] = useState(false);

  // ── Load project ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    getProject(id)
      .then((data) => {
        if (!isMounted) return;
        setProject(data);
        setDocuments(data.documents || []);
        // Seed hasEnteredValidate from already-processed pages (e.g. reopening
        // a project from a previous session) — otherwise it only ever flips on
        // after a successful in-session "Process" call, leaving the Validate
        // tab blank for documents that were already processed earlier.
        const hasProcessedPages = (data.documents || []).some((doc) =>
          (doc.pages || []).some((page) => page.raw_ocr_result || page.extracted_data)
        );
        if (hasProcessedPages) setHasEnteredValidate(true);
      })
      .catch((err) => {
        if (isMounted) setLoadError(err instanceof Error ? err.message : 'Failed to load project.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [id]);

  // Clean up any object URLs created for local previews when leaving.
  useEffect(() => {
    const urls = createdUrlsRef.current;
    return () => {
      urls.forEach(URL.revokeObjectURL);
    };
  }, []);

  // Every page across every document, sorted for stable rendering.
  const allPages = useMemo(() => {
    const list: {
      document: DocumentRecord;
      pageIndex: number;
      status: PageStatus;
      hasResult: boolean;
    }[] = [];
    documents.forEach((doc) => {
      (doc.pages || [])
        .slice()
        .sort((a, b) => a.page_index - b.page_index)
        .forEach((page) => {
          list.push({
            document: doc,
            pageIndex: page.page_index,
            status: page.status,
            hasResult: Boolean(page.raw_ocr_result || page.extracted_data),
          });
        });
    });
    return list;
  }, [documents]);

  // Pages ready for validation, flattened across all documents.
  const validationList = useMemo(() => {
    const list: { documentId: string; pageIndex: number; filename: string }[] = [];
    documents.forEach((doc) => {
      (doc.pages || [])
        .filter((page) => page.raw_ocr_result || page.extracted_data)
        .sort((a, b) => a.page_index - b.page_index)
        .forEach((page) => {
          list.push({ documentId: doc.id, pageIndex: page.page_index, filename: doc.filename });
        });
    });
    return list;
  }, [documents]);

  const fileMetadata = useMemo(() => {
    return documents
      .map((doc) => {
        const count = (doc.pages || []).filter(
          (page) => page.raw_ocr_result || page.extracted_data
        ).length;
        return {
          fileId: doc.id,
          fileName: doc.filename,
          pageCount: count,
        };
      })
      .filter((m) => m.pageCount > 0);
  }, [documents]);

  useEffect(() => {
    validationListRef.current = validationList;
  }, [validationList]);

  // A cheap signature of *which* pages are validate-able (not their content),
  // so the flat extractedPages array only gets rebuilt from `documents` when
  // pages are added/removed — not on every edit (edits flow the other way,
  // through persistPages, so they aren't clobbered by this effect).
  const validationKeysSignature = validationList
    .map((entry) => pageKey(entry.documentId, entry.pageIndex))
    .join('|');

  // Lazily resolve a viewable image URL for every known page.
  useEffect(() => {
    allPages.forEach(({ document, pageIndex }) => {
      const key = pageKey(document.id, pageIndex);
      if (imageUrlMap[key]) return;
      getDownloadUrl(document.id, pageIndex)
        .then((url) => setImageUrlMap((prev) => (prev[key] ? prev : { ...prev, [key]: url })))
        .catch((err) => console.error('Failed to load page image', err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPages]);

  function findPage(documentId: string, pageIndex: number) {
    const doc = documents.find((d) => d.id === documentId);
    return doc?.pages?.find((p) => p.page_index === pageIndex);
  }

  function getExtractedData(documentId: string, pageIndex: number): ExtractedPage | null {
    const page = findPage(documentId, pageIndex);
    if (!page) return null;
    if (page.extracted_data) return page.extracted_data;
    if (page.raw_ocr_result)
      return { ...flatten(extractComponents(page.raw_ocr_result)), pageIndex };
    return null;
  }

  // Persist a full pages array back to each page's document/pageIndex pair
  // (the project workspace saves per-page, unlike ValidationPage's single
  // saveExtractionSession call), and mirror the change into `documents` so
  // the Files view and future validate-mode entries stay in sync. This is
  // the one bit of domain knowledge <ValidationWorkspace> doesn't have —
  // everything else about editing/review lives there.
  const persistPages = useCallback((pages: ExtractedPage[]) => {
    const entries = validationListRef.current;

    setDocuments((prev) =>
      prev.map((doc) => {
        const updatesForDoc = entries
          .map((entry, idx) => ({ entry, page: pages[idx] }))
          .filter(({ entry, page }) => entry.documentId === doc.id && page);
        if (updatesForDoc.length === 0) return doc;
        return {
          ...doc,
          pages: (doc.pages || []).map((page) => {
            const match = updatesForDoc.find(({ entry }) => entry.pageIndex === page.page_index);
            if (!match) return page;
            return { ...page, extracted_data: match.page, status: 'done' as const };
          }),
        };
      })
    );

    entries.forEach((entry, idx) => {
      const page = pages[idx];
      if (!page) return;
      saveExtractedData(entry.documentId, entry.pageIndex, page).catch((err) =>
        console.error('Failed to save extracted data', err)
      );
    });
  }, []);

  // ── Upload ─────────────────────────────────────────────────────────────
  async function handleFilesCaptured(files: File[]) {
    if (!project) return;
    setIsUploading(true);
    setActionError(null);
    try {
      const items = await buildPreviewItemsForFiles(files, createdUrlsRef.current, 0);

      const byFile = new Map<number, typeof items>();
      items.forEach((item) => {
        const key = item.fileIndex ?? 0;
        if (!byFile.has(key)) byFile.set(key, []);
        byFile.get(key)!.push(item);
      });

      for (const group of byFile.values()) {
        let documentId: string | undefined;
        const filename = group[0]?.label ?? 'document';

        for (let pageIndex = 0; pageIndex < group.length; pageIndex++) {
          const item = group[pageIndex];
          if (!item.hasFile || !item.previewSrc) continue;

          const blob = await (await fetch(item.previewSrc)).blob();
          const pageFilename = filename.replace(/\.[^/.]+$/, '') + '.png';
          const result = await uploadPageToR2(
            project.id,
            blob,
            pageFilename,
            pageIndex,
            'image/png',
            documentId
          );
          documentId = result.documentId;
        }

        if (documentId) {
          const finalDocumentId = documentId;
          setDocuments((prev) => {
            const existing = prev.find((d) => d.id === finalDocumentId);
            const newPages = group
              .filter((item) => item.hasFile)
              .map((_, pageIndex) => ({
                id: `${finalDocumentId}-${pageIndex}`,
                document_id: finalDocumentId,
                page_index: pageIndex,
                status: 'pending' as PageStatus,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }));

            if (existing) {
              return prev.map((d) => (d.id === finalDocumentId ? { ...d, pages: newPages } : d));
            }

            return [
              ...prev,
              {
                id: finalDocumentId,
                project_id: project.id,
                storage_path: '',
                filename,
                created_at: new Date().toISOString(),
                pages: newPages,
              },
            ];
          });
        }
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to upload files.');
    } finally {
      setIsUploading(false);
    }
  }

  // ── Selection ──────────────────────────────────────────────────────────
  function toggleSelected(documentId: string, pageIndex: number) {
    const key = pageKey(documentId, pageIndex);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedKeys(new Set(allPages.map((p) => pageKey(p.document.id, p.pageIndex))));
  }

  function deselectAll() {
    setSelectedKeys(new Set());
  }

  // ── Process ────────────────────────────────────────────────────────────
  // Counts how many currently-selected pages are already 'done' — used to
  // decide whether processing needs an "are you sure" confirmation, since
  // reprocessing overwrites their existing extracted data.
  function countSelectedAlreadyProcessed(): number {
    let count = 0;
    documents.forEach((doc) => {
      (doc.pages || []).forEach((page) => {
        if (selectedKeys.has(pageKey(doc.id, page.page_index)) && page.status === 'done') {
          count++;
        }
      });
    });
    return count;
  }

  // Entry point for the "Process" button — routes through a confirmation
  // modal first if any selected page would be reprocessed (overwriting
  // existing data), otherwise processes immediately like before.
  function handleProcessClick() {
    if (selectedKeys.size === 0 || isProcessing) return;
    if (countSelectedAlreadyProcessed() > 0) {
      setShowReprocessConfirm(true);
    } else {
      handleProcessSelected();
    }
  }

  async function handleProcessSelected() {
    if (selectedKeys.size === 0 || isProcessing) return;
    setShowReprocessConfirm(false);
    setIsProcessing(true);
    setProcessingKeys(new Set(selectedKeys));
    setActionError(null);

    try {
      const byDoc = new Map<string, number[]>();
      selectedKeys.forEach((key) => {
        const [documentId, pageIndexStr] = key.split(':');
        if (!byDoc.has(documentId)) byDoc.set(documentId, []);
        byDoc.get(documentId)!.push(Number(pageIndexStr));
      });

      // force:true is a no-op for pages that aren't already 'done', so it's
      // safe to set unconditionally — it only matters for the reprocess case.
      const selections: PageSelection[] = Array.from(byDoc.entries()).map(
        ([documentId, pageIndices]) => ({ documentId, pageIndices, force: true })
      );

      const { results } = await processPages(selections);

      setDocuments((prev) =>
        prev.map((doc) => {
          const docResults = results.filter((r) => r.documentId === doc.id);
          if (docResults.length === 0) return doc;
          return {
            ...doc,
            pages: (doc.pages || []).map((page) => {
              const result = docResults.find((r) => r.pageIndex === page.page_index);
              if (!result) return page;
              return {
                ...page,
                status: result.status,
                raw_ocr_result: result.rawResult ?? page.raw_ocr_result,
                error_message: result.errorMessage,
              };
            }),
          };
        })
      );

      const anySucceeded = results.some((r) => r.status !== 'error');
      setSelectedKeys(new Set());
      if (anySucceeded) {
        setMode('validate');
        setHasEnteredValidate(true);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to process pages.');
    } finally {
      setIsProcessing(false);
      setProcessingKeys(new Set());
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  // Removes deleted pages from `documents`, dropping a document entirely once
  // its last page is gone so the Files view doesn't show an empty section.
  function removePagesFromState(keys: Set<string>) {
    setDocuments((prev) =>
      prev
        .map((doc) => ({
          ...doc,
          pages: (doc.pages || []).filter((page) => !keys.has(pageKey(doc.id, page.page_index))),
        }))
        .filter((doc) => (doc.pages || []).length > 0)
    );
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((key) => next.delete(key));
      return next;
    });
  }

  async function confirmDelete() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setActionError(null);

    try {
      const keys =
        deleteTarget.type === 'single'
          ? [pageKey(deleteTarget.documentId, deleteTarget.pageIndex)]
          : Array.from(selectedKeys);

      const byDoc = new Map<string, number[]>();
      keys.forEach((key) => {
        const [documentId, pageIndexStr] = key.split(':');
        if (!byDoc.has(documentId)) byDoc.set(documentId, []);
        byDoc.get(documentId)!.push(Number(pageIndexStr));
      });

      await Promise.all(
        Array.from(byDoc.entries()).map(([documentId, pageIndices]) => {
          const totalPages = documents.find((d) => d.id === documentId)?.pages?.length ?? 0;
          // Deleting every page of a document removes the document row too,
          // instead of leaving an empty orphan that resurfaces on reload.
          if (totalPages > 0 && pageIndices.length === totalPages) {
            return deleteDocument(documentId);
          }
          return Promise.all(pageIndices.map((pageIndex) => deletePage(documentId, pageIndex)));
        })
      );

      removePagesFromState(new Set(keys));
      setDeleteTarget(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete page(s).');
    } finally {
      setIsDeleting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  if (loadError || !project) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="alert alert-error text-sm">{loadError || 'Project not found.'}</div>
        <Link to="/projects" className="btn btn-ghost mt-4 gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back to projects
        </Link>
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-between px-6 h-12 border-b border-base-300 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <button className="btn btn-ghost btn-sm gap-1.0 p-1.0" onClick={() => navigate('/projects')}>
          <ArrowLeft className="w-4 h-4" /> Projects
        </button>
        <span className="text-base-content/40 p-0">/</span>
        <span className="text-xs font-semibold truncate">{project.name}</span>
      </div>
      {validationList.length > 0 && (
        <div className="join">
          <button
            className={`btn btn-sm join-item gap-1.5 ${mode === 'files' ? 'btn-active' : ''}`}
            onClick={() => setMode('files')}
          >
            <FileText className="w-4 h-4" />
            Files
          </button>
          <button
            className={`btn btn-sm join-item gap-1.5 ${mode === 'validate' ? 'btn-active' : ''}`}
            onClick={() => setMode('validate')}
          >
            <Columns2 className="w-4 h-4" />
            Validate
          </button>
        </div>
      )}
    </div>
  );

  if (documents.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        {header}
        <EmptyUploadView onFilesCaptured={handleFilesCaptured} onError={setActionError} />
        {actionError && (
          <div className="toast toast-top toast-center z-50 mt-16">
            <div className="alert alert-error shadow-lg">{actionError}</div>
          </div>
        )}
      </div>
    );
  }

  const pages = hasEnteredValidate
    ? validationList
        .map((entry) => getExtractedData(entry.documentId, entry.pageIndex))
        .filter((page): page is ExtractedPage => page !== null)
    : [];
  const ocrPages = hasEnteredValidate
    ? validationList.map((entry) =>
        extractComponents(findPage(entry.documentId, entry.pageIndex)?.raw_ocr_result)
      )
    : [];
  const imageUrls = hasEnteredValidate
    ? validationList.map((e) => imageUrlMap[pageKey(e.documentId, e.pageIndex)] || '')
    : [];
  // stable per-page identity for useReviewQueue, so appending pages later
  // doesn't retrigger detection on pages already processed
  const pageKeys = hasEnteredValidate
    ? validationList.map((e) => pageKey(e.documentId, e.pageIndex))
    : [];

  // ── Files/Validation view ─────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col">
      {header}

      {actionError && (
        <div className="toast toast-top toast-center z-50 mt-16">
          <div className="alert alert-error shadow-lg">{actionError}</div>
        </div>
      )}
      {/* FILE VIEW AND UPLOAD */}
      <div className={mode === 'files' ? 'flex-1 flex flex-col' : 'hidden'}>
        <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg bg-base-200/40 px-4 py-2.5">
          <div className="flex items-center gap-3">
            {selectedKeys.size > 0 ? (
              <>
                <span className="text-sm font-medium text-base-content/70">
                  selected ({selectedKeys.size})
                </span>
                <button className="btn btn-ghost btn-xs" onClick={deselectAll}>
                  Clear
                </button>
              </>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={selectAll}>
                Select all
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedKeys.size > 0 && (
              <>
                <button
                  className="btn btn-sm btn-error btn-outline gap-1.5"
                  disabled={isProcessing || isDeleting}
                  onClick={() => setDeleteTarget({ type: 'bulk' })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {`Delete (${selectedKeys.size})`}
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={isProcessing || isDeleting}
                  onClick={handleProcessClick}
                >
                  {isProcessing ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    `Process (${selectedKeys.size})`
                  )}
                </button>
              </>
            )}
            <div className="w-40">
              <UploadMoreButton onFilesSelected={handleFilesCaptured} />
            </div>
          </div>
        </div>

        {isUploading && (
          <div className="px-6 py-2 text-sm text-base-content/60 flex items-center gap-2">
            <span className="loading loading-spinner loading-xs" /> Uploading...
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-6">
            {documents
              .filter((doc) => (doc.pages || []).length > 0)
              .map((doc) => (
              <section
                key={doc.id}
                className="rounded-lg border border-base-300 bg-base-200/40 p-4"
              >
                <h3 className="mb-3 text-sm font-semibold text-base-content/70 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> {doc.filename}
                </h3>
                <div className="flex flex-wrap gap-4">
                  {(doc.pages || [])
                    .slice()
                    .sort((a, b) => a.page_index - b.page_index)
                    .map((page) => {
                      const key = pageKey(doc.id, page.page_index);
                      const imageUrl = imageUrlMap[key];
                      const isBeingProcessed = processingKeys.has(key);
                      return (
                        <div
                          key={key}
                          className={`group w-[160px] shrink-0 rounded-lg border border-base-300 bg-base-100 overflow-hidden transition-opacity ${
                            isBeingProcessed ? 'animate-pulse opacity-80' : ''
                          }`}
                        >
                          <div
                            className={`relative h-[120px] bg-base-300 ${
                              isBeingProcessed ? 'cursor-not-allowed' : 'cursor-pointer'
                            }`}
                            onClick={() => {
                              if (isBeingProcessed) return;
                              toggleSelected(doc.id, page.page_index);
                            }}
                          >
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={`Page ${page.page_index + 1}`}
                                className={`w-full h-full object-cover transition-[filter] ${
                                  isBeingProcessed ? 'grayscale' : ''
                                }`}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <span className="loading loading-spinner loading-sm" />
                              </div>
                            )}
                            <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/25" />
                            <input
                              type="checkbox"
                              className={`checkbox checkbox-sm checkbox-primary absolute border-2 top-2 left-2 transition-opacity ${
                                selectedKeys.has(key) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                              checked={selectedKeys.has(key)}
                              disabled={isBeingProcessed}
                              onChange={() => toggleSelected(doc.id, page.page_index)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs btn-circle absolute top-2 right-2 bg-base-100/80 text-error opacity-0 transition-opacity group-hover:opacity-100"
                              title="Delete page"
                              disabled={isBeingProcessed}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({
                                  type: 'single',
                                  documentId: doc.id,
                                  pageIndex: page.page_index,
                                });
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="p-2 flex items-center justify-between text-xs">
                            <span>Page {page.page_index + 1}</span>
                            <span className={`badge badge-xs ${statusBadgeClass(page.status)}`}>
                              {page.status}
                            </span>
                          </div>
                          {page.error_message && (
                            <div
                              className="px-2 pb-2 text-xs text-error truncate"
                              title={page.error_message}
                            >
                              {page.error_message}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>

      {/* VALIDATION WORKSPACE */}
      {hasEnteredValidate && validationList.length > 0 && (
        <div className={mode === 'validate' ? 'flex-1 flex flex-col' : 'hidden'}>
          <ValidationWorkspace
            pages={pages}
            ocrPages={ocrPages}
            imageUrls={imageUrls}
            pageKeys={pageKeys}
            fileMetadata={fileMetadata}
            syncKey={validationKeysSignature}
            onPersist={persistPages}
            heightClassName="lg:h-[calc(100vh-124px)]"
          />
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg">
              {deleteTarget.type === 'single' ? 'Delete Page' : 'Delete Selected Pages'}
            </h3>
            <p className="py-4 text-sm">
              {deleteTarget.type === 'single'
                ? 'This permanently deletes this page. This cannot be undone.'
                : `This permanently deletes ${selectedKeys.size} selected page(s). This cannot be undone.`}
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button className="btn btn-error" onClick={confirmDelete} disabled={isDeleting}>
                {isDeleting ? <span className="loading loading-spinner loading-sm" /> : 'Delete'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setDeleteTarget(null)} />
        </div>
      )}

      {/* Reprocess confirmation */}
      {showReprocessConfirm && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Reprocess Pages?</h3>
            <p className="py-4 text-sm">
              {`${countSelectedAlreadyProcessed()} of the ${selectedKeys.size} selected page(s) have already been processed. Reprocessing will overwrite their existing extracted data. This cannot be undone.`}
            </p>
            <div className="modal-action">
              <button
                className="btn btn-ghost"
                onClick={() => setShowReprocessConfirm(false)}
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                className="btn btn-warning"
                onClick={handleProcessSelected}
                disabled={isProcessing}
              >
                {isProcessing ? <span className="loading loading-spinner loading-sm" /> : 'Reprocess'}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowReprocessConfirm(false)} />
        </div>
      )}
    </div>
  );
}
