// backend/src/integration/upload.integration.test.ts
import { describe, it, expect, vi, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../app';

// The one real external boundary this flow hits.
vi.mock('../services/ocr/utils/utils_table_extraction_new.js', () => ({
  analyse_result: vi.fn().mockResolvedValue([
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

  it('uploads a page, processes it, and persists the result to the real session', async () => {
    const documentId = 'itest-doc-1';

    const uploadRes = await agent
      .post(`/api/upload/page?documentId=${documentId}&pageIndex=0`)
      .attach('page', Buffer.from('fake-image-bytes'), {
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

  afterAll(() => {
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsRoot)) {
      fs.rmSync(uploadsRoot, { recursive: true, force: true });
      fs.mkdirSync(uploadsRoot);
      fs.writeFileSync(path.join(uploadsRoot, '.gitignore'), '*\n!.gitignore\n');
    }
  });
});