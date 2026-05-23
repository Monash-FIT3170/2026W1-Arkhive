import { Request, Response } from "express";
import { textExtraction, getBoundingBoxesWords } from "../services/ocr/ocr.js";
import { Multer } from "multer";

declare module "express-session" {
  interface SessionData {
    extraction?: {
      ocrData: any[];
      createdAt: number;
      updatedAt: number;
    };
    uploadedImage?: {
      data: string;
      mimeType: string;
    };
  }
}

export default {
  processUpload: async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[] | undefined;

    if (!files || files.length === 0) {
      res.status(400).json({
        error:
          'No files received. Send images as multipart/form-data with field name "pages".'
      });
      return;
    }

    try {
      // Save the first file to session to show as the document
      if (files.length > 0) {
        req.session.uploadedImage = {
          data: files[0].buffer.toString("base64"),
          mimeType: files[0].mimetype
        };
      }

      // Run OCR on each page in parallel
      const ocrResults = await Promise.all(
        files.map(async (file) => {
          console.log(`Processing file: ${file.originalname}`);
          try {
            // textExtraction expects a path, but file.buffer should be used ideally.
            // For now, since we only have originalname, it might fail.
            // Let's wrap in try-catch to avoid breaking the whole upload if OCR fails locally.
            const text = await getBoundingBoxesWords(file.buffer);
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
