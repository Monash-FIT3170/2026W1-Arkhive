import { describe, test, expect } from 'vitest';
import { getUploadedImageUrl } from './uploadService';

describe('getUploadedImageUrl', () => {
  test('loads the first uploaded page when no index is given', () => {
    expect(getUploadedImageUrl()).toBe('/api/upload/image');
  });

  test('points at the selected file page after a dropdown change', () => {
    expect(getUploadedImageUrl(3)).toBe('/api/upload/image/3');
  });
});
