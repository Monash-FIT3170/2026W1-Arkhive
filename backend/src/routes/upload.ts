import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import uploadController from '../controller/upload.js';

// Store files on disk for scalability
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Organize by session ID and document ID
    const sessionId = req.session.id;
    const documentId = (req.query.documentId as string) || 'unknown_document';
    const uploadPath = path.join(process.cwd(), 'uploads', sessionId, documentId);
    
    // Ensure the document directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const pageIndex = (req.query.pageIndex as string) || '0';
    // Generate a predictable but unique filename for the page
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
uploadRouter.post('/page', upload.single('page'), uploadController.uploadPage);

// Endpoint to delete a specific page
uploadRouter.delete('/page/:documentId/:pageIndex', uploadController.deletePage);

// Endpoint to delete an entire document
uploadRouter.delete('/document/:documentId', uploadController.deleteDocument);

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
uploadRouter.get('/image/:documentId/:pageIndex', uploadController.getImage);

// Backwards compatibility endpoint for preview images (returns the first image of the first document)
uploadRouter.get('/image', uploadController.getFirstImage);

export default uploadRouter;