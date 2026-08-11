import { Request, Response } from 'express';
import { parseTableWithRetries } from '../services/ocr/ocr.ts';
import 'express-session';
import 'multer';
import fs from 'fs';
import path from 'path';

declare module "express-session" {
  interface SessionData {
    extraction?: {
      ocrData: any[];
      createdAt: number;
      updatedAt: number;
    };
    // Replaced Base64 'uploadedImage' with an array of filenames stored on disk
    uploadedFiles?: string[];
    // Array of string types mapping to the uploaded files (e.g. ['Invoice', 'Receipt'])
    uploadedTypes?: string[];
  }
}

export default {
  processUpload: async (req: Request, res: Response) => {
    const files = (req as any).files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({
        error:
          'No files received. Send images as multipart/form-data with field name "pages".'
      });
      return;
    }

    try {
      // Auto-cleanup: If the user previously uploaded files in this session, delete them to keep the disk clear.
      // This ensures we do not hoard unused images indefinitely.
      if (req.session.uploadedFiles) {
        for (const filename of req.session.uploadedFiles) {
          const oldPath = path.join(process.cwd(), 'uploads', filename);
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch (err) {
              console.error('Failed to delete old session file:', oldPath, err);
            }
          }
        }
      }

      // Parse metadata if sent from frontend
      const metadataStr = req.body.metadata;
      let metadata: { type: string }[] = [];
      if (metadataStr) {
        try {
          metadata = JSON.parse(metadataStr);
        } catch (e) {
          console.error("Failed to parse metadata", e);
        }
      }

      // Save the new filenames and their classifications to the session
      req.session.uploadedFiles = files.map((f) => f.filename);
      req.session.uploadedTypes = metadata.map(m => m.type);

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Transfer-Encoding', 'chunked');

      // Run OCR on each page in parallel
      const ocrResults = await Promise.all(
        files.map(async (file) => {
          console.log(`Processing file: ${file.originalname}`);
          try {
            // textExtraction expects a path, but file.buffer should be used ideally.
            // For now, since we only have originalname, it might fail.
            // Let's wrap in try-catch to avoid breaking the whole upload if OCR fails locally.
              // Read the file buffer from the disk temporarily for OCR
              const buffer = fs.readFileSync(file.path);
              const text = await parseTableWithRetries(buffer, (attempt, max) => {
                  res.write(JSON.stringify({ type: 'retry', fileName: file.originalname, attempt, maxRetries: max }) + '\n');
              });
            return text;
          } catch (e: any) {
            console.error("OCR failed for file", file.originalname, e);
            const errMsg = e && e.message && e.message.includes("NoTextDetectedError")
              ? e.message.replace("NoTextDetectedError: ", "")
              : "OCR failed. Please double check and reupload your document.";
            res.write(JSON.stringify({ type: 'error', fileName: file.originalname, message: errMsg }) + '\n');
            return []; // return empty array on failure so upload still succeeds
          }
        })
      );

      // Flatten all pages' OCR components into one array
      const ocrData = ocrResults.flat();

      // Save into the session so the Validation page can read it
      req.session.extraction = {
        ocrData,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      res.write(JSON.stringify({ type: 'success', data: { success: true, pageCount: files.length, ocrData } }) + '\n');
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
  }
};
