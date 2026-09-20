import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateUploadUrl,
  generateDownloadUrl,
  getObjectBuffer,
  deleteObject,
  deleteObjects,
  s3Client,
  R2_BUCKET_NAME,
} from './r2Client';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://presigned.r2.cloudflarestorage.com/test-url'),
}));

describe('R2 Client Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates presigned PUT upload URL with correct parameters', async () => {
    const key = 'user1/proj1/doc.pdf';
    const url = await generateUploadUrl(key, 'application/pdf', 300);

    expect(url).toBe('https://presigned.r2.cloudflarestorage.com/test-url');
    expect(getSignedUrl).toHaveBeenCalledWith(
      s3Client,
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          ContentType: 'application/pdf',
        }),
      }),
      { expiresIn: 300 }
    );
  });

  it('generates presigned GET download URL with correct parameters', async () => {
    const key = 'user1/proj1/doc.pdf';
    const url = await generateDownloadUrl(key, 120);

    expect(url).toBe('https://presigned.r2.cloudflarestorage.com/test-url');
    expect(getSignedUrl).toHaveBeenCalledWith(
      s3Client,
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: R2_BUCKET_NAME,
          Key: key,
        }),
      }),
      { expiresIn: 120 }
    );
  });

  it('downloads object as Buffer from stream', async () => {
    const fakeContent = 'Hello R2 stream';
    const stream = Readable.from([Buffer.from(fakeContent)]);

    vi.spyOn(s3Client, 'send').mockResolvedValueOnce({
      Body: stream,
    } as any);

    const buffer = await getObjectBuffer('user1/proj1/file.txt');
    expect(buffer.toString('utf-8')).toBe(fakeContent);
  });

  it('deletes a single object from R2', async () => {
    const sendSpy = vi.spyOn(s3Client, 'send').mockResolvedValueOnce({} as any);

    await deleteObject('user1/proj1/file.txt');

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: R2_BUCKET_NAME,
          Key: 'user1/proj1/file.txt',
        }),
      })
    );
  });

  it('deletes multiple objects in batch', async () => {
    const sendSpy = vi.spyOn(s3Client, 'send').mockResolvedValueOnce({} as any);

    await deleteObjects(['file1.png', 'file2.png']);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: R2_BUCKET_NAME,
          Delete: {
            Objects: [{ Key: 'file1.png' }, { Key: 'file2.png' }],
            Quiet: true,
          },
        }),
      })
    );
  });
});
