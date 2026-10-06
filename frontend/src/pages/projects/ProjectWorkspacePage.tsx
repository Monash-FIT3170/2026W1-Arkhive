import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Trash2, Columns2, FileText as FilesTabIcon } from 'lucide-react';
import { getProject } from '../../services/projectService';
import {
  uploadPageToR2,
  getDownloadUrl,
  processPages,
  saveExtractedData,
  deletePage,
  deleteDocument,
  saveReviewState,
} from '../../services/documentService';
import { buildPreviewItemsForFiles } from '../upload/components/preview/previewHelpers';
import EmptyUploadView from '../upload/components/EmptyUploadView';
import UploadMoreButton from '../upload/components/actions/UploadMoreButton';
import PreviewCard from '../upload/components/preview/PreviewCard';
import PageToolbar, { type ToolbarAction } from '../upload/components/preview/PageToolbar';
import PageGroupSection from '../upload/components/preview/PageGroupSection';
import ValidationWorkspace from '../validation/components/ValidationWorkspace';
import Toast from '../validation/components/modals/Toast';
import { flatten } from '../../utils/flattener';
import { filterValidFiles, partitionBySize, MAX_FILE_SIZE_MB } from '../upload/components/dropzone/dropZoneUtils';
import type {
  ProjectDetail,
  DocumentRecord,
  PageStatus,
  PageSelection,
} from '../../models/Project';
import type { ExtractedPage } from '../../models/TableData';
import type { OCRComponent } from '../../models/OCRComponent';
import { makePageKey, parsePageKey } from '../../utils/keys';
import type { PageReview } from '../../models/IssueReview';

// The OCR backend stores one page's result per document_pages row, but the
// real Azure/Gemini pipeline wraps it as `Pages` — [{ page_num, components }]
// — while the OCR_MODE=mock fixture returns a flat OCRComponent[] instead.
// Unwrap defensively so either shape renders correctly.
function extractComponents(raw: unknown): OCRComponent[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  
  // If the backend saved it as `Pages` (an array of arrays), flatten it
  if (Array.isArray(raw[0])) {
    return raw.flat() as OCRComponent[];
  }

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
  const [showWarningConfirm, setShowWarningConfirm] = useState(false);

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
    .map((entry) => makePageKey(entry.documentId, entry.pageIndex))
    .join('|');

  // Lazily resolve a viewable image URL for every known page.
  useEffect(() => {
    allPages.forEach(({ document, pageIndex }) => {
      const key = makePageKey(document.id, pageIndex);
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
  async function handleFilesCaptured(capturedFiles: File[]) {
    if (!project) return;
    setIsUploading(true);
    setActionError(null);

    const validFiles = filterValidFiles(capturedFiles);
    const { accepted, rejected } = partitionBySize(validFiles);

    if (rejected.length > 0) {
      setActionError(`One or more files are too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`);
      if (accepted.length === 0) {
        setIsUploading(false);
        return;
      }
    }

    try {
      const items = await buildPreviewItemsForFiles(accepted, createdUrlsRef.current, 0);

      const byFile = new Map<number, typeof items>();
      items.forEach((item) => {
        const key = item.fileIndex ?? 0;
        if (!byFile.has(key)) byFile.set(key, []);
        byFile.get(key)!.push(item);
      });

      for (const group of byFile.values()) {
        let documentId: string | undefined;
        const filename = group[0]?.label ?? 'document';

        const pageFlags = new Map<number, any>();

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
            documentId
          );
          documentId = result.documentId;
          pageFlags.set(pageIndex, result.qualityFlags);
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
                quality_flags: pageFlags.get(pageIndex),
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
    const key = makePageKey(documentId, pageIndex);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelectedKeys(new Set(allPages.map((p) => makePageKey(p.document.id, p.pageIndex))));
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
        if (selectedKeys.has(makePageKey(doc.id, page.page_index)) && page.status === 'done') {
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

    let hasWarnings = false;
    documents.forEach((doc) => {
      (doc.pages || []).forEach((page) => {
        if (selectedKeys.has(makePageKey(doc.id, page.page_index))) {
           const flags = page.quality_flags;
           if (flags && flags.shouldWarn) {
             hasWarnings = true;
           }
        }
      });
    });

    if (hasWarnings) {
      setShowWarningConfirm(true);
    } else if (countSelectedAlreadyProcessed() > 0) {
      setShowReprocessConfirm(true);
    } else {
      handleProcessSelected();
    }
  }

  function handleWarningConfirm() {
    setShowWarningConfirm(false);
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
          pages: (doc.pages || []).filter(
            (page) => !keys.has(makePageKey(doc.id, page.page_index))
          ),
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
          ? [makePageKey(deleteTarget.documentId, deleteTarget.pageIndex)]
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

  const initialReviews = useMemo(
    () =>
      Object.fromEntries(
        (project?.documents ?? []).flatMap((doc) =>
          (doc.pages ?? [])
            .filter((p) => p.review_state)
            .map((p) => [makePageKey(doc.id, p.page_index), p.review_state!] as const)
        )
      ),
    [project]
  );

  const handleReviewChange = useCallback((pageKey: string, review: PageReview) => {
    const parsed = parsePageKey(pageKey);
    if (!parsed) return;
    saveReviewState(parsed.documentId, parsed.pageIndex, review).catch((err) =>
      console.error('Failed to save review state', err)
    );
  }, []);

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
        <button
          className="btn btn-ghost btn-sm gap-1.0 p-1.0"
          onClick={() => navigate('/projects')}
        >
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
            <FilesTabIcon className="w-4 h-4" />
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
        <Toast
          open={!!actionError}
          message={actionError || ''}
          type="error"
          onDismiss={() => setActionError(null)}
        />
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
    ? validationList.map((e) => imageUrlMap[makePageKey(e.documentId, e.pageIndex)] || '')
    : [];
  // stable per-page identity for useReviewQueue, so appending pages later
  // doesn't retrigger detection on pages already processed
  const pageKeys = hasEnteredValidate
    ? validationList.map((e) => makePageKey(e.documentId, e.pageIndex))
    : [];

  const filesToolbarActions: ToolbarAction[] = [
    {
      key: 'delete',
      label: `Delete (${selectedKeys.size})`,
      icon: <Trash2 className="w-3.5 h-3.5" />,
      tone: 'error',
      disabled: isProcessing || isDeleting,
      onClick: () => setDeleteTarget({ type: 'bulk' }),
    },
    {
      key: 'process',
      label: `Process (${selectedKeys.size})`,
      tone: 'primary',
      disabled: isProcessing || isDeleting,
      isBusy: isProcessing,
      onClick: handleProcessClick,
    },
  ];

  // ── Files/Validation view ─────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col">
      {header}

      <Toast
        open={!!actionError}
        message={actionError || ''}
        type="error"
        onDismiss={() => setActionError(null)}
      />
      {/* FILE VIEW AND UPLOAD */}
      <div className={mode === 'files' ? 'flex-1 flex flex-col' : 'hidden'}>
        <PageToolbar
          selectedCount={selectedKeys.size}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          actions={filesToolbarActions}
          trailing={
            <div className="w-40">
              <UploadMoreButton onFilesSelected={handleFilesCaptured} onError={setActionError} />
            </div>
          }
        />

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
                <PageGroupSection key={doc.id} label={doc.filename}>
                  {(doc.pages || [])
                    .slice()
                    .sort((a, b) => a.page_index - b.page_index)
                    .map((page) => {
                      const key = makePageKey(doc.id, page.page_index);
                      const imageUrl = imageUrlMap[key];
                      const isBeingProcessed = processingKeys.has(key);
                      return (
                        <PreviewCard
                          key={key}
                          title={`${doc.filename} - Page ${page.page_index + 1}`}
                          caption={`Page ${page.page_index + 1}`}
                          isSelected={selectedKeys.has(key)}
                          thumbnailUrl={imageUrl}
                          isBusy={isBeingProcessed}
                          status={{
                            text: page.status,
                            className: statusBadgeClass(page.status),
                          }}
                          warningText={warningTextForPage(page.quality_flags)}
                          errorText={page.error_message}
                          onToggle={() => toggleSelected(doc.id, page.page_index)}
                          onRemove={() =>
                            setDeleteTarget({
                              type: 'single',
                              documentId: doc.id,
                              pageIndex: page.page_index,
                            })
                          }
                        />
                      );
                    })}
                </PageGroupSection>
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
            initialReviews={initialReviews}
            onReviewChange={handleReviewChange}
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
                {isProcessing ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  'Reprocess'
                )}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowReprocessConfirm(false)} />
        </div>
      )}

      {/* Warning confirmation */}
      {showWarningConfirm && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-warning">Warning: Low Quality Images</h3>
            <p className="py-4 text-sm">
              You have selected images that are flagged for low quality (e.g. blurry, dark, or invalid size).
              Processing these images might produce poor or unexpected OCR results.
              Are you sure you want to continue?
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setShowWarningConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleWarningConfirm}>
                Yes, process anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function warningTextForPage(flags: any): string | undefined {
  if (!flags || !flags.shouldWarn) return undefined;
  if (flags.isInvalidSize) return 'Invalid size';
  if (flags.isBlurry && flags.isDark) return 'Blurry and too dark';
  if (flags.isBlurry) return 'Might be blurry';
  return 'Might be too dark';
}
