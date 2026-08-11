import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import uploadController from '../controller/upload.js';

// Store files on disk for scalability, not in memory
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(process.cwd(), 'uploads');
    // Ensure the uploads directory exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate a unique filename
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname}`);
  },
});

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

// Returns an array of URLs for all uploaded images in the current session
// This makes it easy for the frontend to know how many images exist and fetch them all
uploadRouter.get('/images', (req, res) => {
  const files = req.session.uploadedFiles || [];
  const urls = files.map((_, index) => `/api/upload/image/${index}`);
  res.json(urls);
});

// Returns a specific uploaded image (or the first one if no index is provided)
// This maintains backward compatibility with the frontend that calls GET /api/upload/image
uploadRouter.get(['/image', '/image/:index'], (req, res) => {
  const files = req.session.uploadedFiles;
  if (!files || files.length === 0) {
    res.status(404).json({ error: 'No uploaded images found in session.' });
    return;
  }

  // Parse the index (defaults to 0 if not provided or invalid)
  let index = 0;
  if (req.params.index) {
    index = parseInt(req.params.index as string, 10);
    if (isNaN(index) || index < 0 || index >= files.length) {
      res.status(404).json({ error: 'Invalid image index.' });
      return;
    }
  }

  const filename = files[index];
  const filePath = path.join(process.cwd(), 'uploads', filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Image file not found on disk.' });
    return;
  }

  // Stream the file directly from disk
  res.sendFile(filePath);
});

export default uploadRouter;