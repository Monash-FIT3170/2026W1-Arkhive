import crypto from 'crypto';
import { Store } from 'express-session';
import QRCode from 'qrcode';
import { QrSession, QrSessionStatus } from '../models/QrSession';

const QR_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes, matches "expire after an appropriate period"

// In-memory map, mirroring the app's existing MemoryStore approach for sessions.
const qrSessions = new Map<string, QrSession>();

/**
 * Creates a new QR session tied to the desktop's current session ID, and
 * returns a QR code image (data URL) the desktop can render.
 */
export async function createQrSession(
  desktopSessionId: string,
  documentId: string
): Promise<{ token: string; qrImageDataUrl: string; expiresAt: number }> {
  const token = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + QR_TOKEN_TTL_MS;

  const session: QrSession = {
    token,
    batchId: documentId,
    status: 'pending',
    createdAt: now,
    expiresAt,
    updatedAt: now,
  };

  // Keep desktopSessionId out of the shared QrSession type's public shape used by the
  // frontend poll response; store it separately alongside the session record.
  qrSessions.set(token, session);
  desktopSessionIdByToken.set(token, desktopSessionId);

  const uploadUrl = `${process.env.PUBLIC_APP_URL || ''}/upload/mobile/${token}`;
  const qrImageDataUrl = await QRCode.toDataURL(uploadUrl);

  return { token, qrImageDataUrl, expiresAt };
}

// Separate map so QrSession itself (returned to clients) never leaks the desktop's session id.
const desktopSessionIdByToken = new Map<string, string>();

/**
 * Validates a token exists and hasn't expired. Flips status to 'expired' lazily on read.
 */
export function getQrSession(token: string): QrSession | undefined {
  const session = qrSessions.get(token);
  if (!session) return undefined;

  if (session.status === 'pending' && Date.now() > session.expiresAt) {
    session.status = 'expired';
    session.updatedAt = Date.now();
  }

  return session;
}

export function getDesktopSessionId(token: string): string | undefined {
  return desktopSessionIdByToken.get(token);
}

/**
 * Marks a session as uploaded once the mobile page has successfully sent a file.
 */
export function markUploaded(
  token: string,
  fileName: string,
  imageUrl: string
): void {
  const session = qrSessions.get(token);
  if (!session) return;
  session.status = 'uploaded';
  session.uploadedFileName = fileName;
  session.uploadedImageUrl = imageUrl;
  session.updatedAt = Date.now();
}

export function markFailed(token: string, errorMessage: string): void {
  const session = qrSessions.get(token);
  if (!session) return;
  session.status = 'expired';
  session.errorMessage = errorMessage;
  session.updatedAt = Date.now();
}

/**
 * Loads the desktop's session data from the shared session store (not req.session,
 * since the request coming from the phone belongs to a different session entirely).
 */
export function loadDesktopSession(
  store: Store,
  desktopSessionId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  return new Promise((resolve, reject) => {
    store.get(desktopSessionId, (err, sessionData) => {
      if (err) return reject(err);
      resolve(sessionData);
    });
  });
}

/**
 * Saves updated session data back into the store for the desktop's session ID.
 */
export function saveDesktopSession(
  store: Store,
  desktopSessionId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sessionData: any
): Promise<void> {
  return new Promise((resolve, reject) => {
    store.set(desktopSessionId, sessionData, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}