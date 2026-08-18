// This test file was generated with the assistance of Google Gemini.

//Mocks fetch calls and checks for issues with our own logic
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadPagesToBackend, getUploadedImageUrl } from './uploadService';

describe('uploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('uploadPagesToBackend', () => {
    it('should upload pages successfully', async () => {
      // Mock fetch to simulate downloading blob from previewSrc
      const mockBlob = new Blob(['dummy-image-data'], { type: 'image/png' });
      (global.fetch as any).mockResolvedValueOnce({
        blob: vi.fn().mockResolvedValueOnce(mockBlob)
      });
      
      // Mock fetch for the API upload
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ success: true })
      });
      
      await expect(uploadPagesToBackend([{ src: 'blob:http://localhost/123', type: 'Other' }])).resolves.toBeUndefined();
      
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(global.fetch).toHaveBeenNthCalledWith(1, 'blob:http://localhost/123');
      expect(global.fetch).toHaveBeenNthCalledWith(2, '/api/upload', expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: expect.any(FormData)
      }));
    });

    it('should throw an error if the upload fails', async () => {
      const mockBlob = new Blob(['dummy'], { type: 'image/png' });
      (global.fetch as any).mockResolvedValueOnce({
        blob: vi.fn().mockResolvedValueOnce(mockBlob)
      });
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValueOnce({ error: 'Server error' })
      });
      
      await expect(uploadPagesToBackend([{ src: 'blob:http://localhost/123', type: 'Other' }])).rejects.toThrow('Server error');
    });
  });

  describe('getUploadedImageUrl', () => {
    it('should return the correct image URL', () => {
      expect(getUploadedImageUrl()).toBe('/api/upload/image');
    });
  });
});
