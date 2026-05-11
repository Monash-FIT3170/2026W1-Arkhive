import { Request, Response } from 'express';
import { textExtraction } from '../services/ocr/ocr.js';

declare module 'express-session' {
  interface SessionData {
    extraction?: {
      ocrData: any[];
      createdAt: number;
      updatedAt: number;
    };
  }
}

export default {
  processUpload: async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files received. Send images as multipart/form-data with field name "pages".' });
      return;
    }

    try {
      // Run OCR on each page in parallel
      const ocrResults = await Promise.all(
        files.map((file) => textExtraction(file.buffer.toString('base64')))
      );

      // Flatten all pages' OCR components into one array
      const ocrData = ocrResults.flat();

      // Save into the session so the Validation page can read it
      req.session.extraction = {
        ocrData,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      res.json({ success: true, pageCount: files.length, ocrData });
    } catch (error) {
      console.error('OCR processing error:', error);
      res.status(500).json({
        error: 'OCR processing failed. Check that your Google Vision credentials are configured.',
      });
    }
  },
};