import { useState, useEffect, useMemo } from 'react';
import ValidationWorkspace from './components/ValidationWorkspace';
import type { StructuredPage } from '../../models/Document';
import type { ExtractedPage } from '../../models/TableData';
import {
  getProcessedImageUrls,
  getUploadedImageUrl,
  getUploadedDocuments,
} from '../../services/uploadService';
import {
  getExtractionSession,
  saveExtractionSession,
  getBatchJobs,
  isStructuredPages,
  toExtractedPages,
} from '../../services/extractionService';
import type { FileMetadataInput } from '../../utils/fileGrouping';

// Single-session Upload/Validation flow. This page's only job is knowing
// where the data comes from (the current extraction session) and where it
// gets saved (saveExtractionSession) — everything about editing, review, and
// chat lives in <ValidationWorkspace>, shared with ProjectWorkspacePage.
function ValidationPage() {
  const [imageUrls, setImageUrls] = useState<string[]>([]); // one image URL per page
  const [ocrPages, setOcrPages] = useState<StructuredPage[]>([]); // raw structured OCR, one entry per page
  // Set instead of ocrPages when the session already holds the editor's saved pages
  // (onPersist writes ExtractedPage[]). They carry no blocks, so overlays aren't available then.
  const [savedPages, setSavedPages] = useState<ExtractedPage[] | null>(null);
  const [fileMetadata, setFileMetadata] = useState<FileMetadataInput[]>([]);

  useEffect(() => {
    async function loadSession() {
      try {
        const [session, processedUrls, batchData, uploadedDocs] = await Promise.all([
          getExtractionSession(),
          typeof getProcessedImageUrls === 'function'
            ? getProcessedImageUrls().catch(() => [])
            : Promise.resolve([]),
          typeof getBatchJobs === 'function'
            ? getBatchJobs().catch(() => null)
            : Promise.resolve(null),
          typeof getUploadedDocuments === 'function'
            ? getUploadedDocuments().catch(() => [])
            : Promise.resolve([]),
        ]);

        if (isStructuredPages(session)) setOcrPages(session);
        else setSavedPages(toExtractedPages(session));
        setImageUrls(processedUrls.length > 0 ? processedUrls : [getUploadedImageUrl()]);

        if (uploadedDocs && uploadedDocs.length > 0) {
          setFileMetadata(
            uploadedDocs.map((doc, i) => ({
              fileId: doc.documentId || `doc-${i}`,
              fileName: doc.label || `Document ${i + 1}`,
              pageCount: doc.pages?.length || 1,
            }))
          );
        } else if (batchData && batchData.jobs && batchData.jobs.length > 0) {
          setFileMetadata(
            batchData.jobs.map((job) => ({
              fileId: job.id,
              fileName: job.fileName || `Document ${job.index + 1}`,
              pageCount: 1,
            }))
          );
        }
      } catch (error) {
        console.error('Failed to load extraction session', error);
      }
    }
    loadSession();
  }, []);

  // Flatten ALL pages whenever the raw OCR data changes (toExtractedPages is the single
  // place that calls pageToExtractedPage). Previously saved pages are used as-is so
  // reloading never discards edits. Once this feeds ValidationWorkspace, further edits are the
  // workspace's concern (they get reported back here only via onPersist).
  const extractedPages: ExtractedPage[] = useMemo(
    () => savedPages ?? toExtractedPages(ocrPages),
    [savedPages, ocrPages]
  );

  if (extractedPages.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center font-semibold text-lg">
        Loading...
      </div>
    );
  }

  return (
    <ValidationWorkspace
      pages={extractedPages}
      syncKey={
        savedPages
          ? `saved:${savedPages.length}:${savedPages.map((p) => p.pageIndex).join(',')}`
          : `${ocrPages.length}:${ocrPages.map((p) => p.pageIndex).join(',')}`
      }
      ocrPages={ocrPages.map((p) => p.blocks)}
      imageUrls={imageUrls}
      fileMetadata={fileMetadata}
      onPersist={saveExtractionSession}
      heightClassName="lg:h-[calc(100vh-72px)]"
    />
  );
}

export default ValidationPage;
