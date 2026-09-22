import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import {
  createQrSession,
  getQrSession,
  getDesktopSessionId,
  markUploaded,
  markFailed,
  loadDesktopSession,
  saveDesktopSession,
} from '../services/qrService';
import { QrPollResponse } from '../models/QrSession';

export default {
  // Desktop calls this to get a QR code + token for a brand-new document upload
  generateQr: async (req: Request, res: Response) => {
    try {
      const desktopSessionId = req.session.id;
      // New document, same convention as a fresh scan on desktop
      const documentId = `doc-${Date.now()}`;

      const { token, qrImageDataUrl, expiresAt } = await createQrSession(
        desktopSessionId,
        documentId
      );

      res.json({ token, qrImageDataUrl, expiresAt });
    } catch (error) {
      console.error('Failed to generate QR session:', error);
      res.status(500).json({ error: 'Failed to generate QR code.' });
    }
  },

  // Desktop polls this on an interval while the QR is displayed
  getStatus: (req: Request, res: Response) => {
    const { token } = req.params;
    const session = getQrSession(token);

    if (!session) {
      res.status(404).json({ error: 'QR session not found.' });
      return;
    }

    const response: QrPollResponse = {
      status: session.status,
      uploadedFileName: session.uploadedFileName,
      uploadedImageUrl: session.uploadedImageUrl,
      errorMessage: session.errorMessage,
    };

    res.json(response);
  },

  // Mobile page calls this before rendering the capture UI, to confirm the token is still valid
  validateToken: (req: Request, res: Response) => {
    const { token } = req.params;
    const session = getQrSession(token);

    if (!session || session.status === 'expired') {
      res.status(410).json({ valid: false, error: 'This QR code has expired.' });
      return;
    }

    if (session.status === 'uploaded') {
      res.status(409).json({ valid: false, error: 'This QR code has already been used.' });
      return;
    }

    res.json({ valid: true });
  },

  // Mobile page posts the captured/selected photo here (multer middleware runs first)
  mobileUpload: async (req: Request, res: Response) => {
    const { token } = req.params;
    const file = req.file;

    const session = getQrSession(token);
    const desktopSessionId = getDesktopSessionId(token);

    if (!session || !desktopSessionId) {
      res.status(404).json({ error: 'QR session not found.' });
      return;
    }

    if (session.status !== 'pending') {
      res.status(409).json({ error: 'This QR code is no longer active.' });
      return;
    }

    if (!file) {
      res.status(400).json({ error: 'No file received.' });
      return;
    }

    try {
      const documentId = session.batchId; // documentId was stashed in batchId when the session was created
      const relativePath = path.join(desktopSessionId, documentId, file.filename);

      // Same shape as controller/upload.ts's uploadPage, but written into the
      // desktop's session via the shared store instead of req.session.
      const desktopSessionData = await loadDesktopSession(req.sessionStore, desktopSessionId);

      if (!desktopSessionData) {
        markFailed(token, 'Desktop session no longer exists.');
        res.status(410).json({ error: 'Desktop session expired. Please generate a new QR code.' });
        return;
      }

      if (!desktopSessionData.documents) {
        desktopSessionData.documents = {};
      }
      if (!desktopSessionData.documents[documentId]) {
        desktopSessionData.documents[documentId] = { pages: {} };
      }
      desktopSessionData.documents[documentId].pages['0'] = relativePath;

      await saveDesktopSession(req.sessionStore, desktopSessionId, desktopSessionData);

      const imageUrl = `/api/upload/image/${documentId}/0`;
      markUploaded(token, file.filename, imageUrl);

      res.json({ success: true, imageUrl });
    } catch (error) {
      console.error('Mobile QR upload failed:', error);
      markFailed(token, 'Upload failed. Please try again.');
      res.status(500).json({ error: 'Upload failed. Please try again.' });
    }
  },
};