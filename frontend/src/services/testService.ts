import { apiUrl } from './apiBase';

/**
 * Fetches the mock OCR test data.
 * Mirrors GET /api/extraction/testData
 */
export async function getTestData(): Promise<any> {
  const response = await fetch(apiUrl('/api/test/testData'), {
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch test data with status ${response.status}`);
  }

  return await response.json();
}

/**
 * Fetches the list of mock test image URLs.
 * Mirrors GET /api/extraction/testImageUrls
 */
export async function getTestImageUrls(): Promise<string[]> {
  const response = await fetch(apiUrl('/api/test/testImageUrls'), {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch test image URLs with status ${response.status}`);
  }

  return await response.json();
}

/**
 * Returns a URL pointing at a mock test image by index.
 * Use this directly as an <img src> — it hits
 * GET /api/extraction/testImage/:index which streams the file from disk.
 */
export function getTestImageUrl(index: number = 0): string {
  return apiUrl(`/api/test/testImage/${index}`);
}
