// MobileCapture is the page a phone lands on after scanning a desktop's QR code.
// No login required — the token in the URL is the only proof of access, and it's
// single-use and short-lived (enforced entirely on the backend).
//
// Supports multiple photos: gallery picker allows selecting several at once,
// the camera button adds one photo at a time. All queued photos upload together
// in a single request when the user taps "Upload".

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { validateQrToken, uploadPhotosToQrSession } from '../../services/qrService';

type PageState = 'checking' | 'valid' | 'uploading' | 'done' | 'invalid' | 'error';

interface QueuedPhoto {
  file: File;
  previewUrl: string;
}

export default function MobileCapture() {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>(token ? 'checking' : 'invalid');
  const [errorMessage, setErrorMessage] = useState<string | null>(
    token ? null : 'No upload code was provided.'
  );
  const [queue, setQueue] = useState<QueuedPhoto[]>([]);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Check the token is still valid before showing the capture UI
  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    validateQrToken(token).then((result) => {
      if (cancelled) return;
      if (result.valid) {
        setPageState('valid');
      } else {
        setPageState('invalid');
        setErrorMessage(result.error ?? 'This QR code is no longer valid.');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Clean up preview object URLs on unmount
  useEffect(() => {
    return () => {
      queue.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newItems: QueuedPhoto[] = Array.from(files).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setQueue((prev) => [...prev, ...newItems]);
  }

  function removeAt(index: number) {
    setQueue((prev) => {
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return next;
    });
  }

  async function handleUpload() {
    if (!token || queue.length === 0) return;
    setPageState('uploading');
    setErrorMessage(null);

    try {
      await uploadPhotosToQrSession(
        token,
        queue.map((item) => item.file)
      );
      setPageState('done');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setPageState('error');
    }
  }

  return (
    <div className="bg-base-100 min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold mb-2">Arkhive</h1>

      {pageState === 'checking' && <span className="loading loading-spinner loading-lg mt-4" />}

      {pageState === 'invalid' && (
        <div className="alert alert-warning max-w-sm mt-4">
          <span>{errorMessage ?? 'This QR code is no longer valid.'}</span>
        </div>
      )}

      {(pageState === 'valid' || pageState === 'uploading' || pageState === 'error') && (
        <div className="w-full max-w-sm mt-4 flex flex-col gap-4">
          <p className="text-base-content/70">
            Take photos or choose several from your gallery, then upload them together.
          </p>

          {/* capture="environment" opens the rear camera directly on most phones */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = ''; // allow taking the same-looking photo again
            }}
          />
          {/* multiple lets the gallery's own picker select several photos at once */}
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => cameraInputRef.current?.click()}
            disabled={pageState === 'uploading'}
          >
            Take photo
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => galleryInputRef.current?.click()}
            disabled={pageState === 'uploading'}
          >
            Choose photos
          </button>

          {queue.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {queue.map((item, index) => (
                <div key={item.previewUrl} className="relative">
                  <img
                    src={item.previewUrl}
                    alt={`Selected document page ${index + 1}`}
                    className="rounded-lg border border-base-300 aspect-square object-cover w-full"
                  />
                  <button
                    type="button"
                    className="btn btn-circle btn-xs btn-error absolute -top-2 -right-2"
                    onClick={() => removeAt(index)}
                    disabled={pageState === 'uploading'}
                    aria-label="Remove photo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {pageState === 'error' && errorMessage && (
            <div className="alert alert-error">
              <span>{errorMessage}</span>
            </div>
          )}

          {queue.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={pageState === 'uploading'}
            >
              {pageState === 'uploading'
                ? 'Uploading...'
                : `Upload ${queue.length} photo${queue.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {pageState === 'done' && (
        <div className="alert alert-success max-w-sm mt-4">
          <span>Upload successful! You can close this page and return to your computer.</span>
        </div>
      )}
    </div>
  );
}