import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
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
import { fileMetadataFromProcessedImages } from './processedFileMetadata';

interface LocationState {
  taskId?: string;
  projectId?: string;
}

export default function ValidationPage() {
  const location = useLocation();
  const navState = location.state as LocationState | null;

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [ocrPages, setOcrPages] = useState<StructuredPage[]>([]);
  const [savedPages, setSavedPages] = useState<ExtractedPage[] | null>(null);
  const [fileMetadata, setFileMetadata] = useState<FileMetadataInput[]>([]);
  const [docType, setDocType] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      setIsLoading(true);
      try {
        const targetTaskId = navState?.taskId;

        // Safely call helpers with 0 arguments to match their existing declarations
        const [session, processedUrls, batchData, uploadedDocs] = await Promise.all([
          getExtractionSession(targetTaskId),
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
        else if (session) setSavedPages(toExtractedPages(session));

        if (
          session &&
          typeof session === 'object' &&
          'docType' in session &&
          typeof (session as any).docType === 'string'
        ) {
          setDocType((session as any).docType);
        }

        setImageUrls(processedUrls.length > 0 ? processedUrls : [getUploadedImageUrl()]);

        const processedMetadata = fileMetadataFromProcessedImages(
          processedUrls,
          uploadedDocs ?? []
        );
        if (processedMetadata) {
          setFileMetadata(processedMetadata);
        } else if (uploadedDocs && uploadedDocs.length > 0) {
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
      } finally {
        setIsLoading(false);
      }
    }

    loadSession();
  }, [navState?.taskId]);

  const extractedPages: ExtractedPage[] = useMemo(
    () => savedPages ?? toExtractedPages(ocrPages),
    [savedPages, ocrPages]
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center font-semibold text-lg">
        <span className="loading loading-spinner loading-md mr-2" />
        Loading validation session...
      </div>
    );
  }

  if (extractedPages.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 font-semibold text-base-content/60">
        <p className="text-lg">No validation data found for this session.</p>
        <p className="text-sm">Try processing the document again from the upload screen.</p>
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
      docType={docType}
      onPersist={saveExtractionSession}
      heightClassName="lg:h-[calc(100vh-72px)]"
    />
  );
}