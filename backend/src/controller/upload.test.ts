import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('../services/ocr/ocr', () => ({
  parseTableWithRetries: vi.fn(),
}));

import uploadController from './upload';
import { INVALID_FILE_CONTENTS_ERROR } from '../services/security/fileValidation';

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

function writeTempFile(data: Buffer, filename: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkhive-upload-'));
  tempDirs.push(dir);
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, data);
  return filePath;
}

function createMockReqRes(file: { path: string; filename: string; mimetype: string } | undefined) {
  const req: any = {
    file,
    query: { documentId: 'doc-1', pageIndex: '0' },
    body: {},
    session: { id: 'test-session' },
  };
  let statusCode = 200;
  let jsonResponse: any = null;
  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      jsonResponse = data;
      return res;
    },
  };
  return { req, res, getStatus: () => statusCode, getJson: () => jsonResponse };
}

describe('uploadPage file signature check', () => {
  it('keeps a file whose bytes match the claimed PNG type', () => {
    const filePath = writeTempFile(PNG_HEADER, 'page-0.png');
    const { req, res, getStatus, getJson } = createMockReqRes({
      path: filePath,
      filename: 'page-0.png',
      mimetype: 'image/png',
    });

    uploadController.uploadPage(req, res);

    expect(getStatus()).toBe(200);
    expect(getJson().success).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(req.session.documents['doc-1']).toBeDefined();
  });

  it('rejects and deletes a file labelled PNG whose contents are fake', () => {
    const filePath = writeTempFile(Buffer.from('fake-image-bytes'), 'page-0.png');
    const { req, res, getStatus, getJson } = createMockReqRes({
      path: filePath,
      filename: 'page-0.png',
      mimetype: 'image/png',
    });

    uploadController.uploadPage(req, res);

    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({ error: INVALID_FILE_CONTENTS_ERROR });
    expect(fs.existsSync(filePath)).toBe(false);
    expect(req.session.documents).toBeUndefined();
  });
});
