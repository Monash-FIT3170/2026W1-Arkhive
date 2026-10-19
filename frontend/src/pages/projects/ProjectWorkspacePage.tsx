import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Trash2, Columns2, FileText as FilesTabIcon } from 'lucide-react';
import { getProject } from '../../services/projectService';
import {
  uploadPageToR2,
  getDownloadUrl,
  saveExtractedData,
  deletePage,
  deleteDocument,
  saveReviewState,
} from '../../services/documentService';
import { buildPreviewItemsForFiles } from '../upload/components/preview/previewHelpers';
import EmptyUploadView from '../upload/components/EmptyUploadView';
import UploadMoreButton from '../upload/components/actions/UploadMoreButton';
import ScanQrButton from '../upload/components/actions/ScanQrButton';
import { getUploadedDocuments, deleteDocumentFromBackend } from '../../services/uploadService';
import PreviewCard from '../upload/components/preview/PreviewCard';
import PageToolbar, { type ToolbarAction } from '../upload/components/preview/PageToolbar';
import PageGroupSection from '../upload/components/preview/PageGroupSection';
import ValidationWorkspace from '../validation/components/ValidationWorkspace';
import Toast from '../validation/components/modals/Toast';
import { pageToExtractedPage } from '../../utils/flattener';
import {
  filterValidFiles,
  partitionBySize,
  MAX_FILE_SIZE_MB,
} from '../upload/components/dropzone/dropZoneUtils';
import type { ProjectDetail, DocumentRecord, PageStatus } from '../../models/Project';
import type { ExtractedPage } from '../../models/TableData';
import type { Block, StructuredPage } from '../../models/Document';
import { makePageKey, parsePageKey } from '../../utils/keys';
import type { PageReview } from '../../models/IssueReview';
import type { HistoryEntry } from '../../models/HistoryEntry';
import OcrProgressPopup from '../../components/ocr-progress/OcrProgressPopup';
import { useOcrProgress } from '../../context/OcrProgressContext';

function isBlock(x: unknown): x is Block {
  const kind = (x as { kind?: unknown } | null)?.kind;
  return kind === 'table' || kind === 'field' || kind === 'text';
}

function extractStructuredPage(raw: unknown, pageIndex: number): StructuredPage {
  const empty: StructuredPage = { pageIndex, blocks: [] };
  if (!raw || typeof raw !== 'object') return empty;

  if (Array.isArray(raw)) {
    if (raw.every(isBlock)) return { pageIndex, blocks: raw };
    console.warn('raw_ocr_result is in a legacy shape; reprocess this page to view it.');
    return empty;
  }

  const obj = raw as { blocks?: unknown; pages?: unknown };

  if (Array.isArray(obj.blocks)) return { pageIndex, blocks: obj.blocks.filter(isBlock) };

  if (Array.isArray(obj.pages)) {
    const pages = obj.pages as StructuredPage[];
    const match = pages.find((p) => p?.pageIndex === pageIndex) ?? pages[0];
    return { pageIndex, blocks: Array.isArray(match?.blocks) ? match.blocks.filter(isBlock) : [] };
  }

  return empty;
}

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
  const { enqueue: enqueueOcr } = useOcrProgress();
  const location = useLocation();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showReprocessConfirm, setShowReprocessConfirm] = useState(false);
  const [showWarningConfirm, setShowWarningConfirm] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<
    { type: 'single'; documentId: string; pageIndex: number } | { type: 'bulk' } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const navState = location.state as { mode?: string } | null;
  const initialMode = navState?.mode === 'validate' ? 'validate' : 'files';
  const [mode, setMode] = useState<'files' | 'validate'>(initialMode);

  const [imageUrlMap, setImageUrlMap] = useState<Record<string, string>>({});
  const createdUrlsRef = useRef<string[]>([]);

  const validationListRef = useRef<{ documentId: string; pageIndex: number; filename: string }[]>(
    []
  );
  const [hasEnteredValidate, setHasEnteredValidate] = useState<boolean>(initialMode === 'validate');
  const [dataVersion, setDataVersion] = useState(0);

  // Force the mode to update if the user clicks the popup while already on this page
  useEffect(() => {
    const currentState = location.state as { mode?: string } | null;
    if (currentState?.mode === 'validate') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMode('validate');
      setHasEnteredValidate(true);
    }
  }, [location]);

  // Fallback to files mode if trapped in validate mode with nothing to validate
  useEffect(() => {
    if (mode === 'validate' && documents.length > 0) {
      const hasProcessedPages = documents.some((doc) =>
        (doc.pages || []).some((page) => page.raw_ocr_result || page.extracted_data)
      );
      if (!hasProcessedPages) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMode('files');
      }
    }
  }, [mode, documents]);

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

  useEffect(() => {
    const urls = createdUrlsRef.current;
    return () => {
      urls.forEach(URL.revokeObjectURL);
    };
  }, []);

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

  const validationKeysSignature =
    validationList.map((entry) => makePageKey(entry.documentId, entry.pageIndex)).join('|') +
    `#${dataVersion}`;

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

  const { validationPages, validationBlocks } = useMemo(() => {
    const validationPages: ExtractedPage[] = [];
    const validationBlocks: Block[][] = [];
    if (!hasEnteredValidate) return { validationPages, validationBlocks };

    validationList.forEach((entry) => {
      const page = documents
        .find((d) => d.id === entry.documentId)
        ?.pages?.find((p) => p.page_index === entry.pageIndex);
      const structured = extractStructuredPage(page?.raw_ocr_result, entry.pageIndex);
      validationBlocks.push(structured.blocks);
      validationPages.push(
        page?.extracted_data
          ? { ...page.extracted_data, pageIndex: entry.pageIndex }
          : pageToExtractedPage(structured)
      );
    });
    return { validationPages, validationBlocks };
  }, [documents, validationList, hasEnteredValidate]);

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

  async function handleQrUploaded(docId?: string) {
    setIsUploading(true);
    setMode('files');
    setActionError(null);
    try {
      const sessionDocs = await getUploadedDocuments();
      const targetDocs = docId ? sessionDocs.filter((d) => d.documentId === docId) : sessionDocs;

      if (targetDocs.length === 0) {
        setIsUploading(false);
        return;
      }

      const files: File[] = [];
      for (const doc of targetDocs) {
        for (let i = 0; i < doc.pages.length; i++) {
          const page = doc.pages[i];
          const pageUrl = typeof page === 'string' ? page : page.url;
          const blob = await (await fetch(pageUrl)).blob();
          const filename = doc.label || `qr_capture_${doc.documentId}_${i}.png`;
          files.push(new File([blob], filename, { type: blob.type }));
        }
        await deleteDocumentFromBackend(doc.documentId).catch(console.error);
      }

      setIsUploading(false);
      if (files.length > 0) {
        await handleFilesCaptured(files);
      }
    } catch (err) {
      setActionError('Failed to import photos from phone.');
      console.error(err);
      setIsUploading(false);
    }
  }

  async function handleFilesCaptured(capturedFiles: File[]) {
    console.log('Files captured:', capturedFiles);
    if (!project) return;
    setIsUploading(true);
    setMode('files');
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

  function handleProcessClick() {
    if (selectedKeys.size === 0) return;

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
    if (selectedKeys.size === 0) return;
    setShowReprocessConfirm(false);
    setActionError(null);

    const queuedKeys = new Set(selectedKeys);
    const byDoc = new Map<string, number[]>();

    selectedKeys.forEach((key) => {
      const parts = key.split(':');
      const documentId = parts[0];
      const pageIdx = parseInt(parts[1], 10);
      if (!byDoc.has(documentId)) byDoc.set(documentId, []);
      if (!isNaN(pageIdx)) byDoc.get(documentId)!.push(pageIdx);
    });

    const selection = Array.from(byDoc.entries()).map(([documentId, pages]) => ({
      documentId,
      pages,
      force: true,
    }));

    setDocuments((prev) =>
      prev.map((doc) => {
        if (!byDoc.has(doc.id)) return doc;
        return {
          ...doc,
          pages: (doc.pages || []).map((page) =>
            queuedKeys.has(makePageKey(doc.id, page.page_index))
              ? { ...page, status: 'processing' as PageStatus }
              : page
          ),
        };
      })
    );

    setSelectedKeys(new Set());

    enqueueOcr({
      projectId: project?.id ?? id ?? '',
      selection,
      label: project?.name ? `${project.name} (${selection.length} files)` : 'Project Documents',
      onSettled: (task, result) => {
        const rawJobs = (result as any)?.results ?? (result as any)?.jobs ?? [];
        const jobs = Array.isArray(rawJobs) ? rawJobs : [];

        setDocuments((prev) =>
          prev.map((doc) => {
            if (!byDoc.has(doc.id)) return doc;
            return {
              ...doc,
              pages: (doc.pages || []).map((page) => {
                const pageKey = makePageKey(doc.id, page.page_index);
                if (!queuedKeys.has(pageKey)) return page;

                const job =
                  jobs.find(
                    (j: any) => j.documentId === doc.id && j.pageIndex === page.page_index
                  ) || jobs.find((j: any) => j.documentId === doc.id);
                if (job) {
                  return {
                    ...page,
                    status:
                      job.status === 'failed' || job.status === 'error'
                        ? ('error' as PageStatus)
                        : ('done' as PageStatus),
                    error_message: job.errorMessage,
                    raw_ocr_result: job.rawResult ?? page.raw_ocr_result,
                  };
                }

                return {
                  ...page,
                  status:
                    task.status === 'completed' ? ('done' as PageStatus) : ('error' as PageStatus),
                  error_message: task.error,
                };
              }),
            };
          })
        );

        const currentProjectId = project?.id ?? id;
        if (currentProjectId) {
          getProject(currentProjectId)
            .then((data) => {
              setProject(data);
              setDocuments(data.documents || []);
              const hasProcessedPages = (data.documents || []).some((doc) =>
                (doc.pages || []).some((p) => p.raw_ocr_result || p.extracted_data)
              );
              if (hasProcessedPages) {
                setHasEnteredValidate(true);
              }
            })
            .catch((err) => console.error('Failed to reload project data after OCR:', err));
        }

        if (task.status === 'completed') {
          setDataVersion((v) => v + 1);
          setHasEnteredValidate(true);
        } else if (task.error) {
          setActionError(task.error);
        }
      },
    });
  }

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

  const initialHistory = useMemo(() => {
    const entries: HistoryEntry[] = [];
    (documents ?? []).forEach((doc) => {
      (doc.pages ?? []).forEach((page) => {
        if (Array.isArray(page.history_entries)) {
          entries.push(...page.history_entries);
        }
      });
    });
    return entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [documents]);

  const handleReviewChange = useCallback((pageKey: string, review: PageReview) => {
    const parsed = parsePageKey(pageKey);
    if (!parsed) return;
    saveReviewState(parsed.documentId, parsed.pageIndex, review).catch((err) =>
      console.error('Failed to save review state', err)
    );
  }, []);

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
        <EmptyUploadView
          onFilesCaptured={handleFilesCaptured}
          onError={setActionError}
          onQrUploaded={handleQrUploaded}
        />
        <Toast
          open={!!actionError}
          message={actionError || ''}
          type="error"
          onDismiss={() => setActionError(null)}
        />
      </div>
    );
  }

  const imageUrls = hasEnteredValidate
    ? validationList.map((e) => imageUrlMap[makePageKey(e.documentId, e.pageIndex)] || '')
    : [];

  const pageKeys = hasEnteredValidate
    ? validationList.map((e) => makePageKey(e.documentId, e.pageIndex))
    : [];

  const filesToolbarActions: ToolbarAction[] = [
    {
      key: 'delete',
      label: `Delete (${selectedKeys.size})`,
      icon: <Trash2 className="w-3.5 h-3.5" />,
      tone: 'error',
      disabled: isDeleting,
      onClick: () => setDeleteTarget({ type: 'bulk' }),
    },
    {
      key: 'process',
      label: `Process (${selectedKeys.size})`,
      tone: 'primary',
      text: 'text-base-100',
      disabled: isDeleting,
      onClick: handleProcessClick,
    },
  ];

  return (
    <div className="flex-1 flex flex-col">
      {header}

      <Toast
        open={!!actionError}
        message={actionError || ''}
        type="error"
        onDismiss={() => setActionError(null)}
      />
      <div className={mode === 'files' ? 'flex-1 flex flex-col' : 'hidden'}>
        <PageToolbar
          selectedCount={selectedKeys.size}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
          actions={filesToolbarActions}
          trailing={
            <div className="flex items-center gap-2">
              <ScanQrButton onUploaded={handleQrUploaded} className="btn btn-outline btn-sm" />
              <div className="w-40">
                <UploadMoreButton onFilesSelected={handleFilesCaptured} onError={setActionError} />
              </div>
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
                      const isBeingProcessed = page.status === 'processing';
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

      {hasEnteredValidate && validationList.length > 0 && (
        <div className={mode === 'validate' ? 'flex-1 flex flex-col' : 'hidden'}>
          <ValidationWorkspace
            pages={validationPages}
            ocrPages={validationBlocks}
            imageUrls={imageUrls}
            pageKeys={pageKeys}
            initialReviews={initialReviews}
            onReviewChange={handleReviewChange}
            initialHistory={initialHistory}
            fileMetadata={fileMetadata}
            syncKey={validationKeysSignature}
            onPersist={persistPages}
            heightClassName="lg:h-[calc(100vh-124px)]"
          />
        </div>
      )}

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

      {showReprocessConfirm && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg">Reprocess Pages?</h3>
            <p className="py-4 text-sm">
              {`${countSelectedAlreadyProcessed()} of the ${selectedKeys.size} selected page(s) have already been processed. Reprocessing will overwrite their existing extracted data. This cannot be undone.`}
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => setShowReprocessConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-warning" onClick={handleProcessSelected}>
                Reprocess
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowReprocessConfirm(false)} />
        </div>
      )}

      {showWarningConfirm && (
        <div className="modal modal-open z-50">
          <div className="modal-box">
            <h3 className="font-bold text-lg text-warning">Warning: Low Quality Images</h3>
            <p className="py-4 text-sm">
              You have selected images that are flagged for low quality (e.g. blurry, dark, or
              invalid size). Processing these images might produce poor or unexpected OCR results.
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

      <OcrProgressPopup filterOwnerType="user" />
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
