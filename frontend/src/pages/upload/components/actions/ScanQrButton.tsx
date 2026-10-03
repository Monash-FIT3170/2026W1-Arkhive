// ScanQrButton opens a modal with a QR code the user scans with their phone to
// upload a photo straight into the current session.
//
// To change how often we check for a finished upload  →  edit POLL_INTERVAL_MS
// To change the button look                            →  edit the className prop where it's used
// To change the modal wording                          →  edit the modal markup below

import { useState, useEffect, useRef } from 'react';
import { generateQrSession, pollQrStatus } from '../../../../services/qrService';
import type { QrGenerateResult } from '../../../../services/qrService';

const POLL_INTERVAL_MS = 2000;
const SUCCESS_AUTO_CLOSE_MS = 1500;

type ModalState = 'closed' | 'loading' | 'waiting' | 'success' | 'expired' | 'error';

interface ScanQrButtonProps {
  // Called once the phone's upload has landed in the session, so the parent can refresh its previews
  onUploaded: () => void;
  className?: string;
  disabled?: boolean;
}

export default function ScanQrButton({
  onUploaded,
  className = 'btn btn-outline',
  disabled = false,
}: ScanQrButtonProps) {
  const [modalState, setModalState] = useState<ModalState>('closed');
  const [qr, setQr] = useState<QrGenerateResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Keep the latest callback in a ref so the polling effect doesn't restart on every parent render
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  }, [onUploaded]);

  // ── Open / close ───────────────────────────────────────────────────────────
  async function openModal() {
    setModalState('loading');
    setErrorMessage(null);
    setQr(null);
    try {
      const result = await generateQrSession();
      setQr(result);
      setModalState('waiting');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to generate QR code.');
      setModalState('error');
    }
  }

  function closeModal() {
    setModalState('closed');
    setQr(null);
    setErrorMessage(null);
  }

  // ── Poll the backend while the QR code is showing ──────────────────────────
  useEffect(() => {
    if (modalState !== 'waiting' || !qr) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const token = qr.token;

    async function check() {
      try {
        const result = await pollQrStatus(token);
        if (cancelled) return;

        if (result.status === 'uploaded') {
          setModalState('success');
          onUploadedRef.current();
          return;
        }
        if (result.status === 'expired') {
          // The backend also uses 'expired' + errorMessage to report a failed upload
          setErrorMessage(result.errorMessage ?? null);
          setModalState('expired');
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(err instanceof Error ? err.message : 'Lost connection while waiting.');
        setModalState('error');
        return;
      }
      timer = setTimeout(check, POLL_INTERVAL_MS);
    }

    timer = setTimeout(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [modalState, qr]);

  // Close the modal automatically shortly after a successful upload
  useEffect(() => {
    if (modalState !== 'success') return;
    const timer = setTimeout(closeModal, SUCCESS_AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [modalState]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <button type="button" className={className} onClick={openModal} disabled={disabled}>
        Scan QR to upload
      </button>

      {modalState !== 'closed' && (
        <div className="modal modal-open z-50">
          <div className="modal-box text-center">
            <h3 className="font-bold text-lg">Upload from your phone</h3>

            {modalState === 'loading' && (
              <div className="py-8">
                <span className="loading loading-spinner loading-lg" />
              </div>
            )}

            {modalState === 'waiting' && qr && (
              <>
                <p className="py-3 text-sm">
                  Scan this code with your phone camera, then take or choose a photo.
                </p>
                <img
                  src={qr.qrImageDataUrl}
                  alt="QR code to upload a document from your phone"
                  className="mx-auto h-56 w-56"
                />
                <p className="pt-3 text-xs text-base-content/60">
                  Waiting for your upload… This code expires in a few minutes.
                </p>
              </>
            )}

            {modalState === 'success' && (
              <div className="alert alert-success mt-4">
                <span>Upload successful! Your document has been added.</span>
              </div>
            )}

            {modalState === 'expired' && (
              <div className="alert alert-warning mt-4">
                <span>
                  {errorMessage ?? 'This QR code has expired. Generate a new one to try again.'}
                </span>
              </div>
            )}

            {modalState === 'error' && (
              <div className="alert alert-error mt-4">
                <span>{errorMessage ?? 'Something went wrong. Please try again.'}</span>
              </div>
            )}

            <div className="modal-action justify-center">
              {(modalState === 'expired' || modalState === 'error') && (
                <button type="button" className="btn btn-primary" onClick={openModal}>
                  Generate new code
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={closeModal}>
                {modalState === 'success' ? 'Done' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}