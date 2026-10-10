// backend/src/integration/upload.integration.test.ts
import { describe, it, expect, vi, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../app';
import type { StructuredDocument } from '../models/Document';

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
      .attach('page', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'), {
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

  afterAll(() => {
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsRoot)) {
      fs.rmSync(uploadsRoot, { recursive: true, force: true });
      fs.mkdirSync(uploadsRoot);
      fs.writeFileSync(path.join(uploadsRoot, '.gitignore'), '*\n!.gitignore\n');
    }
  });
});
