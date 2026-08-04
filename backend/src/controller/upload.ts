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

      // Run OCR on each page in parallel
      const ocrResults = await Promise.all(
        files.map(async (file) => {
          console.log(`Processing file: ${file.originalname}`);
          try {
            // Read the file buffer from the disk temporarily for OCR
            const buffer = fs.readFileSync(file.path);
            const text = await parseTableWithRetries(buffer);
            return text;
          } catch (e) {
            console.error("OCR failed for file", file.originalname, e);
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

      res.json({ success: true, pageCount: files.length, ocrData });
    } catch (error) {
      console.error("OCR processing error:", error);
      res.status(500).json({
        error:
          "OCR processing failed. Check that your Google Vision credentials are configured."
      });
    }
  }
};
