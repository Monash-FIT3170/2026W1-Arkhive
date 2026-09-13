import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { getProject } from '../../services/projectService';
import {
  uploadPageToR2,
  getDownloadUrl,
  processPages,
  saveExtractedData,
} from '../../services/documentService';
import { buildPreviewItemsForFiles } from '../upload/components/preview/previewHelpers';
import EmptyUploadView from '../upload/components/EmptyUploadView';
import UploadMoreButton from '../upload/components/actions/UploadMoreButton';
import DocumentPanel from '../validation/components/document/DocumentPanel';
import ExtractedDataPanel from '../validation/components/extracted-data/ExtractedDataPanel';
import { flatten } from '../validation/components/extracted-data/flattener';
import type { ProjectDetail, DocumentRecord, PageStatus, PageSelection } from '../../models/Project';
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

// MVP project workspace: upload pages into the project, batch-process them
// with OCR, then validate/edit the extracted table per page. Intentionally
// simpler than the session-based Upload/Validation flow — no AI chat
// suggestions, bulk review, or undo/redo yet. Pages are flattened across all
// of the project's documents for validation (one continuous carousel).

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
  const [actionError, setActionError] = useState<string | null>(null);

  const [mode, setMode] = useState<'files' | 'validate'>('files');
  const [currentValidationIndex, setCurrentValidationIndex] = useState(0);
  const [hoveredTableFieldIds, setHoveredTableFieldIds] = useState<string[]>([]);
  const [hoveredDocumentOverlayIds, setHoveredDocumentOverlayIds] = useState<string[]>([]);

  const [imageUrlMap, setImageUrlMap] = useState<Record<string, string>>({});
  const createdUrlsRef = useRef<string[]>([]);

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
    const list: { document: DocumentRecord; pageIndex: number; status: PageStatus; hasResult: boolean }[] = [];
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
    if (page.raw_ocr_result) return { ...flatten(extractComponents(page.raw_ocr_result)), pageIndex };
    return null;
  }

  function updateExtractedData(
    documentId: string,
    pageIndex: number,
    updater: (data: ExtractedPage) => ExtractedPage
  ) {
    const current = getExtractedData(documentId, pageIndex);
    if (!current) return;
    const updated = updater(current);

    setDocuments((prev) =>
      prev.map((doc) => {
        if (doc.id !== documentId) return doc;
        return {
          ...doc,
          pages: (doc.pages || []).map((page) =>
            page.page_index === pageIndex
              ? { ...page, extracted_data: updated, status: 'done' as const }
              : page
          ),
        };
      })
    );

    saveExtractedData(documentId, pageIndex, updated).catch((err) =>
      console.error('Failed to save extracted data', err)
    );
  }

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
  async function handleProcessSelected() {
    if (selectedKeys.size === 0 || isProcessing) return;
    setIsProcessing(true);
    setActionError(null);

    try {
      const byDoc = new Map<string, number[]>();
      selectedKeys.forEach((key) => {
        const [documentId, pageIndexStr] = key.split(':');
        if (!byDoc.has(documentId)) byDoc.set(documentId, []);
        byDoc.get(documentId)!.push(Number(pageIndexStr));
      });

      const selections: PageSelection[] = Array.from(byDoc.entries()).map(
        ([documentId, pageIndices]) => ({ documentId, pageIndices })
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
        setCurrentValidationIndex(0);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to process pages.');
    } finally {
      setIsProcessing(false);
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
      <div className="flex items-center gap-3 min-w-0">
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={() => navigate('/projects')}>
          <ArrowLeft className="w-4 h-4" /> Projects
        </button>
        <span className="font-semibold truncate">{project.name}</span>
      </div>
      {validationList.length > 0 && (
        <div className="join">
          <button
            className={`btn btn-sm join-item ${mode === 'files' ? 'btn-active' : ''}`}
            onClick={() => setMode('files')}
          >
            Files
          </button>
          <button
            className={`btn btn-sm join-item ${mode === 'validate' ? 'btn-active' : ''}`}
            onClick={() => setMode('validate')}
          >
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

  if (mode === 'validate' && validationList.length > 0) {
    const entry = validationList[Math.min(currentValidationIndex, validationList.length - 1)];
    const extractedData = getExtractedData(entry.documentId, entry.pageIndex);
    const ocrData = extractComponents(findPage(entry.documentId, entry.pageIndex)?.raw_ocr_result);
    const imageUrls = validationList.map((e) => imageUrlMap[pageKey(e.documentId, e.pageIndex)] || '');

    if (!extractedData) {
      return (
        <div className="flex h-screen items-center justify-center font-semibold text-lg">
          Loading...
        </div>
      );
    }

    return (
      <>
        {header}
        <div className="flex flex-col lg:flex-row w-full p-3 gap-3 h-auto lg:h-[calc(100vh-124px)] lg:overflow-hidden">
          <div className="w-full h-[50vh] lg:h-full lg:w-1/2">
            <DocumentPanel
              hoveredOverlayIds={hoveredDocumentOverlayIds}
              documentImageUrl={imageUrls[currentValidationIndex]}
              ocrData={ocrData}
              imageUrls={imageUrls}
              currentPageIndex={currentValidationIndex}
              onPageChange={setCurrentValidationIndex}
            />
          </div>
          <div className="w-full h-[50vh] lg:h-full lg:w-1/2">
            <ExtractedDataPanel
              extractedData={extractedData}
              hoveredOverlayIds={hoveredTableFieldIds}
              onHover={(fieldId) => {
                setHoveredTableFieldIds(fieldId ? [fieldId] : []);
                if (fieldId) {
                  const [rowId, column] = fieldId.split(':');
                  const row = extractedData.rows.find((r) => String(r._id) === rowId);
                  const overlayId = row?._cellKeyMap?.[column] ?? null;
                  setHoveredDocumentOverlayIds(overlayId ? [overlayId] : []);
                } else {
                  setHoveredDocumentOverlayIds([]);
                }
              }}
              onCellEdit={(fieldId, newValue) => {
                const [rowId, column] = fieldId.split(':');
                updateExtractedData(entry.documentId, entry.pageIndex, (data) => ({
                  ...data,
                  rows: data.rows.map((r) =>
                    String(r._id) === rowId ? { ...r, [column]: newValue } : r
                  ),
                }));
              }}
              onRowAdd={() => {
                updateExtractedData(entry.documentId, entry.pageIndex, (data) => {
                  const newRow: any = { _id: `manual_row_${Date.now()}`, _confidence: 1, _cellConfidence: {} };
                  data.columns.forEach((col) => {
                    newRow[col] = '';
                  });
                  return { ...data, rows: [...data.rows, newRow] };
                });
              }}
              onRowDelete={(rowId) => {
                updateExtractedData(entry.documentId, entry.pageIndex, (data) => ({
                  ...data,
                  rows: data.rows.filter((r) => r._id !== rowId),
                }));
              }}
              onColumnAdd={(columnName) => {
                updateExtractedData(entry.documentId, entry.pageIndex, (data) => {
                  if (data.columns.includes(columnName)) return data;
                  return {
                    ...data,
                    columns: [...data.columns, columnName],
                    rows: data.rows.map((r) => ({ ...r, [columnName]: '' })),
                  };
                });
              }}
              onColumnDelete={(columnName) => {
                updateExtractedData(entry.documentId, entry.pageIndex, (data) => ({
                  ...data,
                  columns: data.columns.filter((c) => c !== columnName),
                  rows: data.rows.map((r) => {
                    const newRow = { ...r };
                    delete newRow[columnName];
                    return newRow;
                  }),
                }));
              }}
              onRowMove={(rowId, direction) => {
                updateExtractedData(entry.documentId, entry.pageIndex, (data) => {
                  const rows = [...data.rows];
                  const idx = rows.findIndex((r) => r._id === rowId);
                  const canMove =
                    idx !== -1 &&
                    ((direction === 'up' && idx > 0) || (direction === 'down' && idx < rows.length - 1));
                  if (!canMove) return data;
                  if (direction === 'up') [rows[idx - 1], rows[idx]] = [rows[idx], rows[idx - 1]];
                  else [rows[idx], rows[idx + 1]] = [rows[idx + 1], rows[idx]];
                  return { ...data, rows };
                });
              }}
              onColumnReorder={(newColumns) => {
                updateExtractedData(entry.documentId, entry.pageIndex, (data) => ({
                  ...data,
                  columns: newColumns,
                }));
              }}
            />
          </div>
        </div>
      </>
    );
  }

  // ── Files view ─────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col">
      {header}

      {actionError && (
        <div className="toast toast-top toast-center z-50 mt-16">
          <div className="alert alert-error shadow-lg">{actionError}</div>
        </div>
      )}

      <div className="flex items-center justify-between px-6 py-3 border-b border-base-300 gap-3">
        <div className="flex items-center gap-2">
          <button className="btn btn-sm btn-outline" onClick={selectAll}>
            Select all
          </button>
          <button className="btn btn-sm btn-outline" onClick={deselectAll}>
            Deselect all
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <UploadMoreButton onFilesSelected={handleFilesCaptured} />
          </div>
          <button
            className="btn btn-sm btn-primary"
            disabled={selectedKeys.size === 0 || isProcessing}
            onClick={handleProcessSelected}
          >
            {isProcessing ? (
              <span className="loading loading-spinner loading-sm" />
            ) : (
              `Process Selected (${selectedKeys.size})`
            )}
          </button>
        </div>
      </div>

      {isUploading && (
        <div className="px-6 py-2 text-sm text-base-content/60 flex items-center gap-2">
          <span className="loading loading-spinner loading-xs" /> Uploading...
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col gap-6">
          {documents.map((doc) => (
            <section key={doc.id} className="rounded-lg border border-base-300 bg-base-200/40 p-4">
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
                    return (
                      <div
                        key={key}
                        className="w-[160px] shrink-0 rounded-lg border border-base-300 bg-base-100 overflow-hidden"
                      >
                        <div
                          className="relative h-[120px] bg-base-300 cursor-pointer"
                          onClick={() => toggleSelected(doc.id, page.page_index)}
                        >
                          {imageUrl ? (
                            <img src={imageUrl} alt={`Page ${page.page_index + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="loading loading-spinner loading-sm" />
                            </div>
                          )}
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm checkbox-primary absolute top-2 left-2"
                            checked={selectedKeys.has(key)}
                            onChange={() => toggleSelected(doc.id, page.page_index)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="p-2 flex items-center justify-between text-xs">
                          <span>Page {page.page_index + 1}</span>
                          <span className={`badge badge-xs ${statusBadgeClass(page.status)}`}>
                            {page.status}
                          </span>
                        </div>
                        {page.error_message && (
                          <div className="px-2 pb-2 text-xs text-error truncate" title={page.error_message}>
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
  );
}
