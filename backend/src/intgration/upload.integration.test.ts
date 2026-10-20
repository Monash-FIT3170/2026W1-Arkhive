// backend/src/integration/upload.integration.test.ts
import { describe, it, expect, vi, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../app';
import type { StructuredDocument } from '../models/Document';
import {
  INVALID_FILE_CONTENTS_ERROR,
  INVALID_UPLOAD_PATH_ERROR,
} from '../services/security/fileValidation';

/** 1x1 PNG. A bare signature is not enough once image processing runs for real. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// The one real external boundary this flow hits: Azure + Gemini, behind
// parseDocumentWithRetries. Everything else (session, disk storage, image
// processing) runs for real so the test proves the actual round trip.
const { mockStructured } = vi.hoisted(() => ({
  mockStructured: {
    docType: 'invoice',
    docTypeConfidence: 0.9,
    pages: [
      {
        pageIndex: 0,
        blocks: [
          { id: 'b1', kind: 'field', key: 'total', label: 'Total', value: 'Invoice total: $42.00', confidence: 0.97 },
        ],
      },
    ],
  } satisfies StructuredDocument,
}));

vi.mock('../services/ocr/ocr', () => ({
  parseDocumentWithRetries: vi.fn().mockResolvedValue(mockStructured),
}));

describe('upload -> process integration', () => {
  const agent = request.agent(app); // keeps the session cookie across requests

  it('uploads a page, processes it, and persists the result to the real session', async () => {
    const documentId = 'itest-doc-1';

    const uploadRes = await agent
      .post(`/api/upload/page?documentId=${documentId}&pageIndex=0`)
      .attach('page', TINY_PNG, {
        filename: 'page-0.png',
        contentType: 'image/png',
      });
    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.success).toBe(true);

    const processRes = await agent
      .post('/api/upload/process')
      .send({ selected: [{ documentId, pages: ['0'] }] });
    expect(processRes.status).toBe(200);

    const events = processRes.text.trim().split('\n').map((l) => JSON.parse(l));
    const final = events[events.length - 1];
    expect(final.type).toBe('success');
    expect(final.data.ocrData[0].blocks[0].value).toBe('Invoice total: $42.00');

    // The part a fake req/res object can never prove: that it actually
    // round-tripped through real session middleware, not just the response.
    const extractionRes = await agent.get('/api/extraction');
    expect(extractionRes.status).toBe(200);
    expect(extractionRes.body[0].blocks[0].value).toBe('Invoice total: $42.00');
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
      .attach('page', TINY_PNG, {
        filename: 'page-0.png',
        contentType: 'image/png',
      });

    expect(uploadRes.status).toBe(400);
    expect(uploadRes.body.error).toBe(INVALID_UPLOAD_PATH_ERROR);

    const uploadsRoot = path.join(process.cwd(), 'uploads');
    expect(fs.existsSync(path.join(uploadsRoot, 'secret'))).toBe(false);
  });

  it('keeps an earlier processed page when another page is processed later', async () => {
    const guest = request.agent(app);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );

    for (const documentId of ['keep-a', 'keep-b']) {
      const uploadRes = await guest
        .post(`/api/upload/page?documentId=${documentId}&pageIndex=0`)
        .attach('page', png, {
          filename: `${documentId}.png`,
          contentType: 'image/png',
        });
      expect(uploadRes.status).toBe(200);
    }

    const first = await guest
      .post('/api/upload/process')
      .send({ selected: [{ documentId: 'keep-a', pages: ['0'] }] });
    expect(first.status).toBe(200);

    const second = await guest
      .post('/api/upload/process')
      .send({ selected: [{ documentId: 'keep-b', pages: ['0'] }] });
    expect(second.status).toBe(200);

    const images = await guest.get('/api/upload/processed-images');
    expect(images.body).toEqual([
      '/api/upload/image/keep-a/0',
      '/api/upload/image/keep-b/0',
    ]);

    const extraction = await guest.get('/api/extraction');
    expect(extraction.body).toHaveLength(2);
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
