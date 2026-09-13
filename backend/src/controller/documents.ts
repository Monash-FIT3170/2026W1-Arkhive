import { Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthenticatedRequest } from '../middleware/auth';
import { supabase } from '../services/supabaseClient';
import {
  generateUploadUrl,
  generateDownloadUrl,
  getObjectBuffer,
  deleteObject,
  deletePrefix,
} from '../services/r2Client';
import { parseTableWithRetries } from '../services/ocr/ocr';
import type { ExtractedPage } from '../models/TableData';
import type { PageSelection, ProcessedPageResult } from '../models/Project.ts';

/**
 * Verifies the caller owns the project that (transitively) owns `documentId`,
 * and returns the document row. Used by every page-scoped endpoint below so
 * we don't duplicate the ownership join five times.
 */
async function getOwnedDocument(documentId: string, ownerId: string) {
  const { data: document, error } = await supabase
    .from('documents')
    .select('*, projects!inner(owner_id)')
    .eq('id', documentId)
    .eq('projects.owner_id', ownerId)
    .single();

  if (error || !document) return null;
  return document;
}

export default {
  /**
   * POST /api/documents/upload-url
   * Generates a presigned PUT URL for a single page's PNG in R2, and ensures
   * both the parent `documents` row and this page's `document_pages` row
   * exist (status defaults to 'pending' — a fresh upload has no OCR yet).
   *
   * Body: { projectId, filename, contentType?, pageIndex, documentId? }
   */
  getUploadUrl: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { projectId, filename, contentType, pageIndex, documentId: existingDocId } = req.body;
      const ownerId = req.userId;

      if (!projectId || !filename) {
        res.status(400).json({ error: 'projectId and filename are required.' });
        return;
      }

      if (pageIndex === undefined || pageIndex === null) {
        res
          .status(400)
          .json({ error: 'pageIndex is required — documents are stored as per-page PNGs.' });
        return;
      }

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .eq('owner_id', ownerId)
        .single();

      if (projectError || !project) {
        res.status(403).json({ error: 'Project not found or not owned by user.' });
        return;
      }

      const mimeType = contentType || 'image/png';
      const docId = existingDocId || randomUUID();
      const numericPageIndex = Number(pageIndex);

      const storageKey = `${ownerId}/${projectId}/${docId}/page-${numericPageIndex}.png`;
      const baseStoragePath = `${ownerId}/${projectId}/${docId}`;

      const uploadUrl = await generateUploadUrl(storageKey, mimeType, 300);

      if (!existingDocId) {
        const { error: insertError } = await supabase.from('documents').insert({
          id: docId,
          project_id: projectId,
          storage_path: baseStoragePath,
          filename: filename,
        });

        if (insertError) {
          console.error('Failed to create document record:', insertError);
          res.status(500).json({ error: insertError.message });
          return;
        }
      }

      // Ensure this page has a row to hang status/OCR data off of. If it
      // already exists (e.g. re-upload of the same page), leave it alone —
      // upsert with ignoreDuplicates so we don't clobber existing OCR state.
      const { error: pageInsertError } = await supabase
        .from('document_pages')
        .upsert(
          { document_id: docId, page_index: numericPageIndex, status: 'pending' },
          { onConflict: 'document_id,page_index', ignoreDuplicates: true }
        );

      if (pageInsertError) {
        console.error('Failed to create document_pages record:', pageInsertError);
        res.status(500).json({ error: pageInsertError.message });
        return;
      }

      res.status(201).json({
        uploadUrl,
        documentId: docId,
        pageIndex: numericPageIndex,
        storageKey,
      });
    } catch (err: any) {
      console.error('Error generating upload URL:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * GET /api/documents/:id/download-url
   * GET /api/documents/:id/pages/:pageIndex/url
   */
  getDownloadUrl: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id, pageIndex: paramPageIndex } = req.params as {
        id: string;
        pageIndex: string;
      };
      const queryPageIndex = req.query.pageIndex;
      const pageIndex = paramPageIndex !== undefined ? paramPageIndex : queryPageIndex;
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const document = await getOwnedDocument(id, ownerId);
      if (!document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      let key = document.storage_path;
      if (pageIndex !== undefined && pageIndex !== null) {
        key = `${document.storage_path}/page-${pageIndex}.png`;
      } else if (!key.includes('.')) {
        key = `${document.storage_path}/page-0.png`;
      }

      const downloadUrl = await generateDownloadUrl(key, 900);

      res.json({
        downloadUrl,
        documentId: document.id,
        filename: document.filename,
        pageIndex: pageIndex !== undefined ? Number(pageIndex) : undefined,
      });
    } catch (err: any) {
      console.error('Error generating download URL:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * GET /api/documents/:id
   * Returns document metadata plus every page's status/extracted_data, so
   * the frontend can decide per-page whether to show "processed — go to
   * validation" or "needs OCR" without any extra calls.
   */
  getDocument: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params as { id: string };

      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const document = await getOwnedDocument(id, ownerId);
      if (!document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      const { data: pages, error: pagesError } = await supabase
        .from('document_pages')
        .select('*')
        .eq('document_id', id)
        .order('page_index', { ascending: true });

      if (pagesError) {
        console.error('Failed to fetch document pages:', pagesError);
        res.status(500).json({ error: pagesError.message });
        return;
      }

      res.json({ ...document, pages: pages || [] });
    } catch (err: any) {
      console.error('Error fetching document:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * POST /api/documents/process
   * Batch endpoint: takes pages across one or MORE documents in a single
   * call (`selections: PageSelection[]`), so a user can tick pages from
   * several files and process them together.
   *
   * For each requested page:
   *   - if status is already 'done' and `force` is not set, it's SKIPPED —
   *     no OCR call, no R2 read. This is what lets a user reopen a project
   *     and only pay for OCR on pages they haven't validated yet.
   *   - otherwise OCR runs, and the raw result is persisted onto that page's
   *     row immediately (not just returned in the response), so if the user
   *     navigates away mid-validation the raw result is still there.
   *
   * Body: { selections: PageSelection[] }
   */
  processDocument: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { selections } = req.body as { selections?: PageSelection[] };
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      if (!Array.isArray(selections) || selections.length === 0) {
        res.status(400).json({ error: 'selections must be a non-empty array.' });
        return;
      }

      const results: ProcessedPageResult[] = [];

      for (const selection of selections) {
        const { documentId, pageIndices, force } = selection;

        const document = await getOwnedDocument(documentId, ownerId);
        if (!document) {
          for (const pageIndex of pageIndices) {
            results.push({
              documentId,
              pageIndex,
              status: 'error',
              errorMessage: 'Document not found or access denied.',
            });
          }
          continue;
        }

        const { data: pageRows, error: pagesError } = await supabase
          .from('document_pages')
          .select('*')
          .eq('document_id', documentId)
          .in('page_index', pageIndices);

        if (pagesError) {
          console.error('Failed to fetch document_pages for processing:', pagesError);
          for (const pageIndex of pageIndices) {
            results.push({
              documentId,
              pageIndex,
              status: 'error',
              errorMessage: pagesError.message,
            });
          }
          continue;
        }

        const pageByIndex = new Map((pageRows || []).map((p) => [p.page_index, p]));

        for (const pageIndex of pageIndices) {
          const pageRow = pageByIndex.get(pageIndex);

          // Skip pages already validated, unless the caller forces a redo.
          if (pageRow && pageRow.status === 'done' && !force) {
            results.push({
              documentId,
              pageIndex,
              status: 'done',
              rawResult: pageRow.raw_ocr_result,
              skipped: true,
            });
            continue;
          }

          await supabase
            .from('document_pages')
            .update({ status: 'processing' })
            .eq('document_id', documentId)
            .eq('page_index', pageIndex);

          try {
            const key = `${document.storage_path}/page-${pageIndex}.png`;
            const buffer = await getObjectBuffer(key);
            const rawResult = await parseTableWithRetries(buffer);

            // Persist immediately — this is the fix for "crash mid-validation
            // means re-OCR everything." Status goes back to 'pending' (not
            // 'done') because raw OCR output still needs user validation
            // before it's trustworthy.
            await supabase
              .from('document_pages')
              .update({ status: 'pending', raw_ocr_result: rawResult, error_message: null })
              .eq('document_id', documentId)
              .eq('page_index', pageIndex);

            results.push({ documentId, pageIndex, status: 'pending', rawResult });
          } catch (ocrError: any) {
            const errorMessage =
              ocrError?.message || 'OCR processing failed. Check credentials and document format.';
            console.error(`OCR failed for ${documentId} page ${pageIndex}:`, ocrError);

            await supabase
              .from('document_pages')
              .update({ status: 'error', error_message: errorMessage })
              .eq('document_id', documentId)
              .eq('page_index', pageIndex);

            results.push({ documentId, pageIndex, status: 'error', errorMessage });
          }
        }
      }

      res.json({ success: true, results });
    } catch (err: any) {
      console.error('Error processing documents:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * PATCH /api/documents/:id/pages/:pageIndex/data
   * Persists flattened/validated ExtractedData for ONE page and marks it done.
   * Called after initial OCR flattening and on every subsequent user edit to
   * that page.
   */
  saveExtractedData: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id, pageIndex } = req.params as { id: string; pageIndex: string };
      const { extractedData } = req.body as { extractedData?: ExtractedPage };
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      if (!extractedData || typeof extractedData !== 'object' || Array.isArray(extractedData)) {
        res.status(400).json({ error: 'extractedData must be a single ExtractedData object.' });
        return;
      }

      const document = await getOwnedDocument(id, ownerId);
      if (!document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      const { data: updatedPage, error: updateError } = await supabase
        .from('document_pages')
        .update({ extracted_data: extractedData, status: 'done', error_message: null })
        .eq('document_id', id)
        .eq('page_index', Number(pageIndex))
        .select()
        .single();

      if (updateError || !updatedPage) {
        console.error('Failed to save extracted data:', updateError);
        res
          .status(500)
          .json({ error: updateError?.message || 'Failed to persist extracted data.' });
        return;
      }

      res.json({ success: true, documentId: id, page: updatedPage });
    } catch (err: any) {
      console.error('Error saving extracted data:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * DELETE /api/documents/:id/pages/:pageIndex
   * Removes the page image from R2 and deletes its document_pages row
   * (previously this only deleted the R2 object — the row is what carries
   * OCR/validation state now, so it must go too).
   */
  deletePage: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id, pageIndex } = req.params as { id: string; pageIndex: string };
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const document = await getOwnedDocument(id, ownerId);
      if (!document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      const key = `${document.storage_path}/page-${pageIndex}.png`;
      try {
        await deleteObject(key);
      } catch (r2Err) {
        console.error('Failed to delete page from R2:', r2Err);
      }

      const { error: deleteError } = await supabase
        .from('document_pages')
        .delete()
        .eq('document_id', id)
        .eq('page_index', Number(pageIndex));

      if (deleteError) {
        console.error('Failed to delete document_pages row:', deleteError);
      }

      res.json({ success: true, documentId: id, pageIndex: Number(pageIndex) });
    } catch (err: any) {
      console.error('Error deleting page:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * DELETE /api/documents/:id
   * Removes all pages from R2 storage and deletes the document row.
   * document_pages rows are cleaned up automatically via ON DELETE CASCADE.
   */
  deleteDocument: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params as { id: string };
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const document = await getOwnedDocument(id, ownerId);
      if (!document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      try {
        await deletePrefix(`${document.storage_path}/`);
        await deleteObject(document.storage_path);
      } catch (r2Err) {
        console.error('Failed to delete objects from R2:', r2Err);
      }

      const { error: deleteError } = await supabase.from('documents').delete().eq('id', id);

      if (deleteError) {
        res.status(500).json({ error: deleteError.message });
        return;
      }

      res.json({ success: true, documentId: id });
    } catch (err: any) {
      console.error('Error deleting document:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },
};
