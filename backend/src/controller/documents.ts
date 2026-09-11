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
  listObjects,
} from '../services/r2Client';
import { parseTableWithRetries } from '../services/ocr/ocr';
import type { ExtractedPage } from '../models/TableData';

/** Sort R2 keys like `.../page-2.png` before `.../page-10.png`. */
function sortPageKeysNumerically(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const indexA = Number(a.match(/page-(\d+)/i)?.[1] ?? Number.POSITIVE_INFINITY);
    const indexB = Number(b.match(/page-(\d+)/i)?.[1] ?? Number.POSITIVE_INFINITY);
    return indexA - indexB;
  });
}

export default {
  /**
   * POST /api/documents/upload-url
   * Generates a presigned PUT URL for Cloudflare R2 upload.
   * Supports individual pages of a multi-page document.
   *
   * Body parameters:
   * - projectId: string (required)
   * - filename: string (required)
   * - contentType: string
   * - pageIndex: number | string
   * - documentId: string
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

      // Verify caller owns the project
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

      // Key structure: {owner_id}/{project_id}/{document_id}/page-{pageIndex}.png
      const storageKey = `${ownerId}/${projectId}/${docId}/page-${pageIndex}.png`;
      const baseStoragePath = `${ownerId}/${projectId}/${docId}`;

      // Generate presigned PUT URL (valid for 5 minutes)
      const uploadUrl = await generateUploadUrl(storageKey, mimeType, 300);

      // Create or update document row in Supabase
      if (!existingDocId) {
        const { error: insertError } = await supabase.from('documents').insert({
          id: docId,
          project_id: projectId,
          storage_path: baseStoragePath,
          filename: filename,
          status: 'pending',
        });

        if (insertError) {
          console.error('Failed to create document record:', insertError);
          res.status(500).json({ error: insertError.message });
          return;
        }
      }

      res.status(201).json({
        uploadUrl,
        documentId: docId,
        pageIndex: Number(pageIndex),
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
   * Generates a presigned GET URL for viewing or downloading a document or specific page from R2.
   * Query params:
   * - pageIndex: number (optional)
   */
  getDownloadUrl: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id, pageIndex: paramPageIndex } = req.params;
      const queryPageIndex = req.query.pageIndex;
      const pageIndex = paramPageIndex !== undefined ? paramPageIndex : queryPageIndex;
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      // Fetch document and verify user owns the associated project
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*, projects!inner(owner_id)')
        .eq('id', id)
        .eq('projects.owner_id', ownerId)
        .single();

      if (docError || !document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      // Resolve key:
      // If pageIndex is provided, key is ${document.storage_path}/page-${pageIndex}.png
      // If not provided, either use direct file path or page-0
      let key = document.storage_path;
      if (pageIndex !== undefined && pageIndex !== null) {
        key = `${document.storage_path}/page-${pageIndex}.png`;
      } else if (!key.includes('.')) {
        // base folder, default to page-0.png
        key = `${document.storage_path}/page-0.png`;
      }

      const downloadUrl = await generateDownloadUrl(key, 900); // 15 min expiration

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
   * Retrieves document metadata and OCR results.
   */
  getDocument: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*, projects!inner(owner_id)')
        .eq('id', id)
        .eq('projects.owner_id', ownerId)
        .single();

      if (docError || !document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      res.json(document);
    } catch (err: any) {
      console.error('Error fetching document:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * POST /api/documents/:id/process
   * Runs OCR on all pages of a document stored in R2 and returns raw per-page results.
   * Does not write extracted_data — the frontend flattens/edits then PATCHes /data.
   */
  processDocument: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { pages } = req.body; // Optional array of page indices, e.g. [0, 1] or ['0', '1']
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      // Fetch document and verify ownership
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*, projects!inner(owner_id)')
        .eq('id', id)
        .eq('projects.owner_id', ownerId)
        .single();

      if (docError || !document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      // Mark status as processing
      await supabase.from('documents').update({ status: 'processing' }).eq('id', id);

      // Determine the list of R2 keys to process
      let pageKeys: string[] = [];

      if (Array.isArray(pages) && pages.length > 0) {
        pageKeys = sortPageKeysNumerically(
          pages.map((p) => `${document.storage_path}/page-${p}.png`)
        );
      } else {
        // Discover existing pages under the document prefix
        const prefix = `${document.storage_path}/`;
        try {
          const discovered = await listObjects(prefix);
          if (discovered.length > 0) {
            pageKeys = sortPageKeysNumerically(discovered);
          } else {
            pageKeys = [document.storage_path];
          }
        } catch {
          pageKeys = [document.storage_path];
        }
      }

      // Download and run OCR on all pages
      try {
        const pageResults = await Promise.all(
          pageKeys.map(async (key) => {
            const buffer = await getObjectBuffer(key);
            const text = await parseTableWithRetries(buffer);
            return text;
          })
        );

        const { error: updateError } = await supabase
          .from('documents')
          .update({ status: 'pending' })
          .eq('id', id);

        if (updateError) {
          console.error('Failed to reset document status after OCR:', updateError);
          res.status(500).json({ error: 'Failed to update document status.' });
          return;
        }

        res.json({
          success: true,
          documentId: id,
          status: 'pending',
          rawResult: pageResults,
        });
      } catch (ocrError: any) {
        console.error('OCR processing pipeline failed:', ocrError);
        await supabase.from('documents').update({ status: 'error' }).eq('id', id);

        res.status(500).json({
          error:
            ocrError?.message || 'OCR processing failed. Check credentials and document format.',
        });
      }
    } catch (err: any) {
      console.error('Error processing document:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * PATCH /api/documents/:id/data
   * Persists flattened/edited ExtractedPage[] to extracted_data and marks the document done.
   * Called after initial OCR flattening and on every subsequent user edit.
   */
  saveExtractedData: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { extractedData } = req.body as { extractedData?: ExtractedPage[] };
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      if (!Array.isArray(extractedData)) {
        res.status(400).json({ error: 'extractedData must be an array of ExtractedPage objects.' });
        return;
      }

      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*, projects!inner(owner_id)')
        .eq('id', id)
        .eq('projects.owner_id', ownerId)
        .single();

      if (docError || !document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      const { data: updatedDoc, error: updateError } = await supabase
        .from('documents')
        .update({
          extracted_data: extractedData,
          status: 'done',
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        console.error('Failed to save extracted data:', updateError);
        res.status(500).json({ error: 'Failed to persist extracted data.' });
        return;
      }

      res.json({
        success: true,
        documentId: id,
        status: 'done',
        document: updatedDoc,
      });
    } catch (err: any) {
      console.error('Error saving extracted data:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * DELETE /api/documents/:id/pages/:pageIndex
   * Removes a specific page image from R2.
   */
  deletePage: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id, pageIndex } = req.params;
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      // Fetch document and verify ownership
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*, projects!inner(owner_id)')
        .eq('id', id)
        .eq('projects.owner_id', ownerId)
        .single();

      if (docError || !document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      const key = `${document.storage_path}/page-${pageIndex}.png`;
      try {
        await deleteObject(key);
      } catch (r2Err) {
        console.error('Failed to delete page from R2:', r2Err);
      }

      res.json({ success: true, documentId: id, pageIndex: Number(pageIndex) });
    } catch (err: any) {
      console.error('Error deleting page:', err);
      res.status(500).json({ error: err.message || 'Internal server error.' });
    }
  },

  /**
   * DELETE /api/documents/:id
   * Removes all pages from R2 storage and deletes the database record.
   */
  deleteDocument: async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const ownerId = req.userId;

      if (!ownerId) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      // Fetch document and verify ownership
      const { data: document, error: docError } = await supabase
        .from('documents')
        .select('*, projects!inner(owner_id)')
        .eq('id', id)
        .eq('projects.owner_id', ownerId)
        .single();

      if (docError || !document) {
        res.status(404).json({ error: 'Document not found or access denied.' });
        return;
      }

      // Delete all pages under prefix as well as individual file
      try {
        await deletePrefix(`${document.storage_path}/`);
        await deleteObject(document.storage_path);
      } catch (r2Err) {
        console.error('Failed to delete objects from R2:', r2Err);
      }

      // Delete from database
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
