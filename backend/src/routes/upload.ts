import { Router } from 'express';
import multer from 'multer';
import uploadController from '../controller/upload.js';

// Store files in memory (as Buffer). Do NOT write to disk.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024,  // 25 MB per page
    files: 100,                   // max 100 pages at once
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

uploadRouter.post('/', upload.array('pages'), uploadController.processUpload);

uploadRouter.get('/', (req, res) =>{
  return res.status(204).send(req.session.extraction ?? "")
});

// Returns the image that was uploaded for OCR, stored in the session.
// The frontend uses this to display the actual document in the Document Panel.
uploadRouter.get('/image', (req, res) => {
  const img = req.session.uploadedImage;
  if (!img) {
    res.status(404).json({ error: 'No uploaded image found in session.' });
    return;
  }
  const buffer = Buffer.from(img.data, 'base64');
  res.setHeader('Content-Type', img.mimeType);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});

export default uploadRouter;