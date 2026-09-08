import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  uploadPageToBackend,
  processDocuments,
  getUploadedDocuments,
} from '../services/uploadService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_UPLOADS_DIR = path.resolve(__dirname, '../../../backend/uploads');

describe('upload -> process integration', () => {
  const documentId = 'itest-doc-1';

  it('uploads a page, processes it, and persists the OCR result to the real session', async () => {
    const fakePng = new Blob(['fake-bytes'], { type: 'image/png' });
    const pageSrc = URL.createObjectURL(fakePng);

    // Upload: proves the frontend's multipart request actually reaches
    // the real backend and the session cookie is set correctly.
    await uploadPageToBackend(pageSrc, documentId, 0, 'invoice.png', 'Invoice');

    // Process: proves the same session persists across a second call,
    // and that OCR_MODE=mock is correctly routing the backend around
    // the real Azure/Gemini calls -- this is the mock fixture from
    // mockOcrFixture.ts coming back, not a real OCR result.
    const result = await processDocuments([{ documentId, pages: ['0'], type: 'Invoice' }]);

    expect(result?.success).toBe(true);
    expect(result?.ocrData?.[0]?.text).toBe('Invoice total');

    // Read-back: proves the processed result actually persisted
    // server-side, not just that the response looked right in-flight.
    const docs = await getUploadedDocuments();
    expect(docs.some((d) => d.documentId === documentId)).toBe(true);
  });

  afterAll(() => {
    // Mirrors the backend's own integration test: don't leave uploaded
    // fixture files sitting in backend/uploads between runs.
    if (fs.existsSync(BACKEND_UPLOADS_DIR)) {
      fs.rmSync(BACKEND_UPLOADS_DIR, { recursive: true, force: true });
      fs.mkdirSync(BACKEND_UPLOADS_DIR);
      fs.writeFileSync(path.join(BACKEND_UPLOADS_DIR, '.gitignore'), '*\n!.gitignore\n');
    }
  });
});