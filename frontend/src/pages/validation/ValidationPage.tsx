import { useState, useEffect, useMemo } from 'react';
import ValidationWorkspace from './components/ValidationWorkspace';
import type { Pages } from '../../models/OCRComponent';
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
} from '../../services/extractionService';
import { flatten } from '../../utils/flattener';
import type { FileMetadataInput } from '../../utils/fileGrouping';

// Single-session Upload/Validation flow. This page's only job is knowing
// where the data comes from (the current extraction session) and where it
// gets saved (saveExtractionSession) — everything about editing, review, and
// chat lives in <ValidationWorkspace>, shared with ProjectWorkspacePage.
function ValidationPage() {
  const [imageUrls, setImageUrls] = useState<string[]>([]); // one image URL per page
  const [ocrPages, setOcrPages] = useState<Pages>([]); // raw OCR, one array per page
  const [fileMetadata, setFileMetadata] = useState<FileMetadataInput[]>([]);

  useEffect(() => {
    async function loadSession() {
      try {
        const [ocrData, processedUrls, batchData, uploadedDocs] = await Promise.all([
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

        setOcrPages(ocrData);
        setImageUrls(
          processedUrls.length > 0 ? processedUrls : [getUploadedImageUrl()]
        );

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

  // Flatten ALL pages whenever the raw OCR data changes. This is the single
  // source of truth for extractedPages — nothing else should call flatten()
  // directly. Once this feeds ValidationWorkspace, further edits are the
  // workspace's concern (they get reported back here only via onPersist).
  const extractedPages: ExtractedPage[] = useMemo(
    () =>
      ocrPages.map((page) => ({
        ...flatten(page.components),
        pageIndex: page.page_num - 1,
      })),
    [ocrPages]
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
      syncKey={`${ocrPages.length}:${ocrPages.map((p) => p.page_num).join(',')}`}
      ocrPages={ocrPages.map((p) => p.components)}
      imageUrls={imageUrls}
      fileMetadata={fileMetadata}
      onPersist={saveExtractionSession}
      heightClassName="lg:h-[calc(100vh-72px)]"
    />
  );
}

export default ValidationPage;
