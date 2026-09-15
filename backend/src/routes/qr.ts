// backend/src/routes/qr.ts
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import qrController from '../controller/qrController';
import { getDesktopSessionId, getQrSession } from '../services/qrService';

// Easy-to-tweak limits for QR/mobile uploads.
const MAX_FILE_SIZE_MB = 25;
const MAX_PAGES_PER_QR_UPLOAD = 1; // currently one photo per QR scan, matching a single new document
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
  'image/heic',
  'image/heif',
];

// Store files on disk, same convention as routes/upload.ts, but keyed by the
// QR token's associated desktop session ID instead of the request's own session ID
// (the phone's session is not the desktop's session).
const storage = multer.diskStorage({
  destination: function (req, _file, cb) {
    const token = req.params.token;
    const desktopSessionId = getDesktopSessionId(token);
    const session = getQrSession(token);

    if (!desktopSessionId || !session) {
      cb(new Error('Invalid or expired QR session.'), '');
      return;
    }

    const documentId = session.batchId;
    const uploadPath = path.join(process.cwd(), 'uploads', desktopSessionId, documentId);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `page-0-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

const qrRouter = Router();

// Desktop: generate a new QR code + token for a fresh document upload
qrRouter.post('/generate', qrController.generateQr);

// Desktop: poll for status while the QR code is displayed
qrRouter.get('/:token/status', qrController.getStatus);

// Mobile: check the token is still valid before showing the capture UI
qrRouter.get('/:token/validate', qrController.validateToken);

// Mobile: upload the captured/selected photo
qrRouter.post('/:token/upload', upload.single('page'), qrController.mobileUpload);

export default qrRouter;