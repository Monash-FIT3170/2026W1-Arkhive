import { Request, Response } from 'express';
import { parseTableWithRetries } from '../services/ocr/ocr.ts';
import 'express-session';
import fs from 'fs';
import path from 'path';

declare module "express-session" {
  interface SessionData {
    extraction?: {
      ocrData: any[];
      processedImages?: string[];
      createdAt: number;
      updatedAt: number;
    };
    documents?: {
      [documentId: string]: {
        type?: string;
        label?: string;
        pages: { [pageIndex: string]: string };
      };
    };
  }
}

export default {
  // Upload a single page
  uploadPage: (req: Request, res: Response) => {
    const file = req.file;
    const documentId = req.query.documentId as string;
    const pageIndex = req.query.pageIndex as string;

    if (!file || !documentId || !pageIndex) {
      res.status(400).json({ error: 'Missing file, documentId, or pageIndex.' });
      return;
    }

    if (!req.session.documents) {
      req.session.documents = {};
    }
    if (!req.session.documents[documentId]) {
      req.session.documents[documentId] = { pages: {} };
    }

    // Save the file's relative path so we can retrieve it later
    const sessionId = req.session.id;
    const relativePath = path.join(sessionId, documentId, file.filename);
    req.session.documents[documentId].pages[pageIndex] = relativePath;

    // Optional: save document type if sent
    if (req.body.type) {
      req.session.documents[documentId].type = req.body.type;
    }
    
    // Save document label if sent (only needed once per document)
    if (req.body.label && !req.session.documents[documentId].label) {
      req.session.documents[documentId].label = req.body.label;
    }

    res.json({ success: true, path: relativePath });
  },

  // Delete a specific page
  deletePage: (req: Request, res: Response) => {
    const { documentId, pageIndex } = req.params;
    const doc = req.session.documents?.[documentId];

    if (doc && doc.pages[pageIndex]) {
      const relativePath = doc.pages[pageIndex];
      const absolutePath = path.join(process.cwd(), 'uploads', relativePath);
      
      if (fs.existsSync(absolutePath)) {
        try {
          fs.unlinkSync(absolutePath);
        } catch (err) {
          console.error('Failed to delete file:', absolutePath, err);
        }
      }
      
      delete doc.pages[pageIndex];
      // If document is empty, remove it
      if (Object.keys(doc.pages).length === 0) {
        const dirPath = path.join(process.cwd(), 'uploads', req.session.id, documentId);
        if (fs.existsSync(dirPath)) {
          try {
            fs.rmSync(dirPath, { recursive: true, force: true });
          } catch (err) {
            console.error('Failed to delete empty document directory:', dirPath, err);
          }
        }
        delete req.session.documents![documentId];
      }
    }
    res.json({ success: true });
  },

  // Delete an entire document
  deleteDocument: (req: Request, res: Response) => {
    const { documentId } = req.params;
    
    if (req.session.documents?.[documentId]) {
      const sessionId = req.session.id;
      const dirPath = path.join(process.cwd(), 'uploads', sessionId, documentId);
      
      if (fs.existsSync(dirPath)) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
        } catch (err) {
          console.error('Failed to delete document directory:', dirPath, err);
        }
      }
      
      delete req.session.documents[documentId];
    }
    res.json({ success: true });
  },

  // Process selected documents/pages with OCR
  processDocuments: async (req: Request, res: Response) => {
    const selected: { documentId: string, pages: string[], type: string }[] = req.body.selected || [];
    
    if (!selected || selected.length === 0) {
      res.status(400).json({ error: 'No documents selected for processing.' });
      return;
    }

    const sessionDocs = req.session.documents || {};
    let filesToProcess: { originalname: string; path: string; type: string }[] = [];

    // Gather all selected files
    for (const selection of selected) {
      const { documentId, pages, type } = selection;
      const doc = sessionDocs[documentId];
      if (doc) {
        // Update type if provided
        doc.type = type || doc.type || 'Other';
        
        for (const pageIndex of pages) {
          const relativePath = doc.pages[pageIndex];
          if (relativePath) {
            const absolutePath = path.join(process.cwd(), 'uploads', relativePath);
            if (fs.existsSync(absolutePath)) {
              filesToProcess.push({
                originalname: `${documentId}_page_${pageIndex}`,
                path: absolutePath,
                type: doc.type,
                imageUrl: `/api/upload/image/${documentId}/${pageIndex}`
              });
            }
          }
        }
      }
    }

    if (filesToProcess.length === 0) {
      res.status(400).json({ error: 'Selected files not found on disk.' });
      return;
    }

    try {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      // Run OCR on each page in parallel
      const ocrResults = await Promise.all(
        filesToProcess.map(async (file) => {
          console.log(`Processing file: ${file.originalname}`);
          try {
            const buffer = fs.readFileSync(file.path);
            const text = await parseTableWithRetries(buffer, (attempt, max) => {
              res.write(JSON.stringify({ type: 'retry', fileName: file.originalname, attempt, maxRetries: max }) + '\n');
            });
            // Attach type information back to the result if needed
            return text.map((item: any) => ({ ...item, documentType: file.type }));
          } catch (e: any) {
            console.error("OCR failed for file", file.originalname, e);
            const errMsg = e && e.message && e.message.includes("NoTextDetectedError")
              ? e.message.replace("NoTextDetectedError: ", "")
              : "OCR failed. Please double check and reupload your document.";
            res.write(JSON.stringify({ type: 'error', fileName: file.originalname, message: errMsg }) + '\n');
            return [];
          }
        })
      );

      const ocrData = ocrResults.flat();

      req.session.extraction = {
        ocrData,
        processedImages: filesToProcess.map(f => (f as any).imageUrl),
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      res.write(JSON.stringify({ type: 'success', data: { success: true, pageCount: filesToProcess.length, ocrData } }) + '\n');
      res.end();
    } catch (error) {
      console.error("OCR processing error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "OCR processing failed. Check that your Google Vision credentials are configured."
        });
      } else {
        res.write(JSON.stringify({ type: 'error', message: "OCR processing failed. Check your Google Vision credentials." }) + '\n');
        res.end();
      }
    }
  },

  // Get structured list of documents and pages
  getDocuments: (req: Request, res: Response) => {
    const docs = req.session.documents || {};
    const result = Object.entries(docs).map(([documentId, doc]) => {
      const pages = Object.keys(doc.pages).map(pageIndex => `/api/upload/image/${documentId}/${pageIndex}`);
      return {
        documentId,
        label: doc.label,
        type: doc.type,
        pages
      };
    });
    res.json(result);
  },

  // Get a specific image
  getImage: (req: Request, res: Response) => {
    const { documentId, pageIndex } = req.params;
    const doc = req.session.documents?.[documentId];

    if (!doc || !doc.pages[pageIndex]) {
      res.status(404).json({ error: 'Image not found in session.' });
      return;
    }

    const filePath = path.join(process.cwd(), 'uploads', doc.pages[pageIndex]);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Image file not found on disk.' });
      return;
    }

    res.sendFile(filePath);
  },

  // Backwards compatibility for getting the first image
  getFirstImage: (req: Request, res: Response) => {
    const docs = req.session.documents;
    if (!docs) {
      res.status(404).json({ error: 'No documents found.' });
      return;
    }

    for (const docId of Object.keys(docs)) {
      const doc = docs[docId];
      const pageKeys = Object.keys(doc.pages);
      if (pageKeys.length > 0) {
        const filePath = path.join(process.cwd(), 'uploads', doc.pages[pageKeys[0]]);
        if (fs.existsSync(filePath)) {
          res.sendFile(filePath);
          return;
        }
      }
    }

    res.status(404).json({ error: 'Image not found.' });
  },

  // Get the images that were processed in the current session
  getProcessedImages: (req: Request, res: Response) => {
    const processed = req.session.extraction?.processedImages;
    if (processed && processed.length > 0) {
      res.json(processed);
    } else {
      res.json([]);
    }
  }
};
