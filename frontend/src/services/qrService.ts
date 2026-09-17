import { apiUrl } from './apiBase';

export type QrSessionStatus = 'pending' | 'uploaded' | 'expired';

export interface QrGenerateResult {
  token: string;
  qrImageDataUrl: string;
  expiresAt: number;
}

export interface QrPollResult {
  status: QrSessionStatus;
  uploadedFileName?: string;
  uploadedImageUrl?: string;
  errorMessage?: string;
}

/**
 * Requests a new QR code + token from the backend, tied to the current desktop session.
 */
export async function generateQrSession(): Promise<QrGenerateResult> {
  const response = await fetch(apiUrl('/api/qr/generate'), {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to generate QR code with status ${response.status}`);
  }

  return await response.json();
}

/**
 * Polls the backend for the current status of a QR session. Intended to be called
 * on an interval from the desktop side while the QR code is displayed.
 */
export async function pollQrStatus(token: string): Promise<QrPollResult> {
  const response = await fetch(apiUrl(`/api/qr/${encodeURIComponent(token)}/status`), {
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to check QR status with status ${response.status}`);
  }

  return await response.json();
}

/**
 * Validates a QR token from the mobile side, before showing the capture UI.
 */
export async function validateQrToken(token: string): Promise<{ valid: boolean; error?: string }> {
  const response = await fetch(apiUrl(`/api/qr/${encodeURIComponent(token)}/validate`));
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { valid: false, error: body.error ?? 'This QR code is no longer valid.' };
  }

  return body;
}

/**
 * Uploads the captured/selected photo from the mobile page.
 */
export async function uploadPhotoToQrSession(
  token: string,
  file: Blob,
  fileName: string
): Promise<{ success: boolean; imageUrl: string }> {
  const formData = new FormData();
  formData.append('page', file, fileName);

  const response = await fetch(apiUrl(`/api/qr/${encodeURIComponent(token)}/upload`), {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload failed with status ${response.status}`);
  }

  return await response.json();
}