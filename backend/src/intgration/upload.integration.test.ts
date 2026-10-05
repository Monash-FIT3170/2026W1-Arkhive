// backend/src/integration/upload.integration.test.ts
import { describe, it, expect, vi, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../app';
import { INVALID_FILE_CONTENTS_ERROR, INVALID_UPLOAD_PATH_ERROR } from '../services/security/fileValidation';

/** 12-byte PNG signature so the new magic-byte check accepts the fixture. */
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

// The one real external boundary this flow hits.
vi.mock('../services/ocr/mockOcrFixture.js', () => ({
  getMockOcrResult: vi.fn().mockReturnValue([
    { id: 'comp_1', text: 'Invoice total: $42.00', confidence: 0.97 },
  ]),
}));

// Constructed at module load even though unused in this flow — stub so
// import never touches real credentials.
vi.mock('@google-cloud/vision', () => ({
  default: { ImageAnnotatorClient: class { documentTextDetection = vi.fn(); } },
}));

describe('upload -> process integration', () => {
  const agent = request.agent(app); // keeps the session cookie across requests

  const originalOcrMode = process.env.OCR_MODE;
  beforeAll(() => {
    process.env.OCR_MODE = 'mock';
  });
  afterAll(() => {
    if (originalOcrMode) {
      process.env.OCR_MODE = originalOcrMode;
    } else {
      delete process.env.OCR_MODE;
    }
  });

  it('uploads a page, processes it, and persists the result to the real session', async () => {
    const documentId = 'itest-doc-1';

    const uploadRes = await agent
      .post(`/api/upload/page?documentId=${documentId}&pageIndex=0`)
      .attach('page', PNG_HEADER, {
        filename: 'page-0.png',
        contentType: 'image/png',
      });
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(true);

    const processRes = await agent
      .post('/api/upload/process')
      .send({ selected: [{ documentId, pages: ['0'], type: 'Invoice' }] });
    expect(processRes.status).toBe(200);

    const events = processRes.text.trim().split('\n').map((l) => JSON.parse(l));
    const final = events[events.length - 1];
    expect(final.type).toBe('success');
    expect(final.data.ocrData[0].text).toBe('Invoice total: $42.00');

    // The part a fake req/res object can never prove: that it actually
    // round-tripped through real session middleware, not just the response.
    const extractionRes = await agent.get('/api/extraction');
    expect(extractionRes.status).toBe(200);
    expect(extractionRes.body[0].text).toBe('Invoice total: $42.00');
  });

  it('rejects a page whose contents do not match the claimed PNG type', async () => {
    const documentId = 'itest-doc-fake';

    const uploadRes = await agent
      .post(`/api/upload/page?documentId=${documentId}&pageIndex=0`)
      .attach('page', Buffer.from('fake-image-bytes'), {
        filename: 'page-0.png',
        contentType: 'image/png',
      });

    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.error).toBe(INVALID_FILE_CONTENTS_ERROR);

    const docsRes = await agent.get('/api/upload/documents');
    expect(docsRes.status).toBe(200);
    const fakeDoc = docsRes.body.find((doc: { documentId: string }) => doc.documentId === documentId);
    expect(fakeDoc).toBeUndefined();
  });

  it('rejects a documentId that tries to leave the session folder', async () => {
    const uploadRes = await agent
      .post('/api/upload/page?documentId=../secret&pageIndex=0')
      .attach('page', PNG_HEADER, {
        filename: 'page-0.png',
        contentType: 'image/png',
      });

    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.error).toBe(INVALID_UPLOAD_PATH_ERROR);

    const uploadsRoot = path.join(process.cwd(), 'uploads');
    expect(fs.existsSync(path.join(uploadsRoot, 'secret'))).toBe(false);
  });

  afterAll(() => {
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsRoot)) {
      fs.rmSync(uploadsRoot, { recursive: true, force: true });
      fs.mkdirSync(uploadsRoot);
      fs.writeFileSync(path.join(uploadsRoot, '.gitignore'), '*\n!.gitignore\n');
    }
  });
});