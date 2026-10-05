import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import uploadController from '../controller/upload.js';
import {
  INVALID_UPLOAD_PATH_ERROR,
  isSafeDocumentId,
  isSafePageIndex,
} from '../services/security/fileValidation.js';

function requireSafeUploadQuery(req: Request, res: Response, next: NextFunction) {
  if (!isSafeDocumentId(req.query.documentId) || !isSafePageIndex(req.query.pageIndex)) {
    res.status(400).json({ error: INVALID_UPLOAD_PATH_ERROR });
    return;
  }
  next();
}

function requireSafeDocumentParam(req: Request, res: Response, next: NextFunction) {
  if (!isSafeDocumentId(req.params.documentId)) {
    res.status(400).json({ error: INVALID_UPLOAD_PATH_ERROR });
    return;
  }
  if (req.params.pageIndex !== undefined && !isSafePageIndex(req.params.pageIndex)) {
    res.status(400).json({ error: INVALID_UPLOAD_PATH_ERROR });
    return;
  }
  next();
}

// Store files on disk for scalability
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const sessionId = req.session.id;
    const documentId = req.query.documentId as string;
    if (!isSafeDocumentId(documentId)) {
      cb(new Error(INVALID_UPLOAD_PATH_ERROR), '');
      return;
    }
    const uploadPath = path.join(process.cwd(), 'uploads', sessionId, documentId);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const pageIndex = req.query.pageIndex as string;
    if (!isSafePageIndex(pageIndex)) {
      cb(new Error(INVALID_UPLOAD_PATH_ERROR), '');
      return;
    }
    const ext = path.extname(file.originalname);
    cb(null, `page-${pageIndex}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB per page
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/tiff', 'image/webp', 'image/heic', 'image/heif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const uploadRouter = Router();

// Endpoint to upload a single page immediately
uploadRouter.post(
  '/page',
  requireSafeUploadQuery,
  upload.single('page'),
  uploadController.uploadPage
);

// Endpoint to delete a specific page
uploadRouter.delete(
  '/page/:documentId/:pageIndex',
  requireSafeDocumentParam,
  uploadController.deletePage
);

// Endpoint to delete an entire document
uploadRouter.delete(
  '/document/:documentId',
  requireSafeDocumentParam,
  uploadController.deleteDocument
);

// Endpoint to trigger OCR processing on the uploaded files
uploadRouter.post('/process', uploadController.processDocuments);

// Endpoint to get the list of uploaded documents and their pages
uploadRouter.get('/documents', uploadController.getDocuments);

// Endpoint to get the images that were processed in the current session
uploadRouter.get('/processed-images', uploadController.getProcessedImages);

// Backward compatibility: get extraction result
uploadRouter.get('/', (req, res) => {
  return res.status(204).send(req.session.extraction ?? "");
});

// Returns a specific uploaded image based on documentId and pageIndex
uploadRouter.get(
  '/image/:documentId/:pageIndex',
  requireSafeDocumentParam,
  uploadController.getImage
);

// Backwards compatibility endpoint for preview images (returns the first image of the first document)
uploadRouter.get('/image', uploadController.getFirstImage);

export default uploadRouter;
