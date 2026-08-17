import { Request, Response } from 'express';
import { parseTableWithRetries } from '../services/ocr/ocr.ts';
import 'express-session';
import 'multer';
import fs from 'fs';
import path from 'path';
import type {
  PageMetadata,
  UploadedFileGroup,
  UploadedPage
} from '../types/upload.js';

function parseMetadata(metadataStr: unknown): PageMetadata[] {
  if (typeof metadataStr !== 'string') return [];
  try {
    const parsed = JSON.parse(metadataStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("Failed to parse metadata", e);
    return [];
  }
}

function buildUploadedPage(
  filename: string,
  pageIndex: number,
  meta: PageMetadata | undefined
): UploadedPage {
  return {
    filename,
    pageIndex,
    type: meta?.type ?? 'Other',
    fileIndex: meta?.fileIndex ?? pageIndex,
    fileName: meta?.fileName || `Page ${pageIndex + 1}`,
    pageLabel: meta?.pageLabel
  };
}

function tagOcrComponents(components: any[], page: UploadedPage) {
  return components.map((comp) => {
    const tagged = {
      ...comp,
      id: `p${page.pageIndex}_${comp.id}`,
      fileIndex: page.fileIndex,
      fileName: page.fileName,
      pageIndex: page.pageIndex,
      pageLabel: page.pageLabel
    };
    if (comp.parentId) {
      tagged.parentId = `p${page.pageIndex}_${comp.parentId}`;
    }
    return tagged;
  });
}

export function groupUploadedPages(pages: UploadedPage[]): UploadedFileGroup[] {
  const groups = new Map<number, UploadedFileGroup>();
  for (const page of pages) {
    let group = groups.get(page.fileIndex);
    if (!group) {
      group = {
        fileIndex: page.fileIndex,
        fileName: page.fileName,
        pageIndices: []
      };
      groups.set(page.fileIndex, group);
    }
    group.pageIndices.push(page.pageIndex);
  }
  return Array.from(groups.values());
}

function pagesFromSession(req: Request): UploadedPage[] {
  if (req.session.uploadedPages && req.session.uploadedPages.length > 0) {
    return req.session.uploadedPages;
  }

  // Older sessions only stored filenames; treat each page as its own file.
  return (req.session.uploadedFiles ?? []).map((filename, pageIndex) =>
    buildUploadedPage(filename, pageIndex, {
      type: req.session.uploadedTypes?.[pageIndex]
    })
  );
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

      const metadata = parseMetadata(req.body.metadata);
      const uploadedPages = files.map((file, pageIndex) =>
        buildUploadedPage(file.filename, pageIndex, metadata[pageIndex])
      );

      // Save the new filenames and their classifications to the session
      req.session.uploadedFiles = files.map((f) => f.filename);
      req.session.uploadedTypes = uploadedPages.map((page) => page.type);
      req.session.uploadedPages = uploadedPages;

      // Run OCR on each page in parallel, tagging components with their source file
      const ocrResults = await Promise.all(
        files.map(async (file, pageIndex) => {
          console.log(`Processing file: ${file.originalname}`);
          try {
            // Read the file buffer from the disk temporarily for OCR
            const buffer = fs.readFileSync(file.path);
            const text = await parseTableWithRetries(buffer);
            return tagOcrComponents(text ?? [], uploadedPages[pageIndex]);
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
  },

  listFiles: (req: Request, res: Response) => {
    res.json(groupUploadedPages(pagesFromSession(req)));
  }
};
