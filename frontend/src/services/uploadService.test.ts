import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadPagesToBackend, getUploadedImageUrl, getUploadedImageUrls } from './uploadService';

describe('uploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  describe('uploadPagesToBackend', () => {
    it('should upload pages successfully and handle progress events', async () => {
      const mockBlob = new Blob(['dummy-image-data'], { type: 'image/png' });
      (globalThis.fetch as any).mockResolvedValueOnce({
        blob: vi.fn().mockResolvedValueOnce(mockBlob)
      });

      const streamEvents = [
        JSON.stringify({ type: 'job_progress', index: 1, total: 1, fileName: 'doc.png' }),
        JSON.stringify({ type: 'job_completed', index: 1, total: 1, fileName: 'doc.png', confidence: 0.9 }),
        JSON.stringify({ type: 'success', data: { success: true } }),
        ''
      ].join('\n');

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(streamEvents) })
          .mockResolvedValueOnce({ done: true, value: undefined })
      };

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => mockReader
        }
      });

      const onProgress = vi.fn();
      await uploadPagesToBackend(
        [{ src: 'blob:http://localhost/123', type: 'Other', fileName: 'doc.png' }],
        undefined,
        onProgress
      );

      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenCalledTimes(3);
    });

    it('should throw an error if the upload fails', async () => {
      const mockBlob = new Blob(['dummy'], { type: 'image/png' });
      (globalThis.fetch as any).mockResolvedValueOnce({
        blob: vi.fn().mockResolvedValueOnce(mockBlob)
      });

      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValueOnce({ error: 'Server error' })
      });

      await expect(uploadPagesToBackend([{ src: 'blob:http://localhost/123', type: 'Other' }])).rejects.toThrow('Server error');
    });
  });

  describe('getUploadedImageUrl', () => {
    it('should return the correct image URL for single or indexed requests', () => {
      expect(getUploadedImageUrl()).toBe('/api/upload/image');
      expect(getUploadedImageUrl(0)).toBe('/api/upload/image/0');
      expect(getUploadedImageUrl(2)).toBe('/api/upload/image/2');
    });
  });

  describe('getUploadedImageUrls', () => {
    it('should return array of image URLs', async () => {
      (globalThis.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce(['/api/upload/image/0', '/api/upload/image/1'])
      });

      const urls = await getUploadedImageUrls();
      expect(urls).toEqual(['/api/upload/image/0', '/api/upload/image/1']);
    });
  });
});
