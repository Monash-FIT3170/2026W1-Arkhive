import { Request, Response } from "express";
import { textExtraction, parseTableWithRetries } from "../services/ocr/ocr.ts";
import { Multer } from "multer";
import { SessionData } from "express-session";
import { parse } from "node:path";

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
            const text = await parseTableWithRetries(file.buffer, (attempt, max) => {
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
