import { describe, test, expect } from 'vitest';
import { filterValidFiles, ALLOWED_MIME_TYPES } from './DropZone';

/**
 * DropZone Logic Verification
 * This suite tests the filtering logic written by Mubashir to ensure 
 * the "Capture and Store" requirements for US-1.2 are met.
 */
describe('DropZone File Validation Logic', function () {

  test('should allow valid OCR MIME types', function () {
    // We create a mock FileList-like structure
    const mockFiles = [
      new File(['data'], 'test.pdf', { type: 'application/pdf' }),
      new File(['data'], 'image.png', { type: 'image/png' })
    ] as unknown as FileList;

    const result = filterValidFiles(mockFiles);

    expect(result.length).toBe(2);
    expect(result[0].name).toBe('test.pdf');
  });

  test('should allow HEIC files even if MIME type is missing (Browser Fallback)', function () {
    // Browsers often fail to give HEIC a MIME type, so we check extension
    const mockFiles = [
      new File(['data'], 'photo.heic', { type: '' })
    ] as unknown as FileList;

    const result = filterValidFiles(mockFiles);

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('photo.heic');
  });

  test('should strictly reject non-OCR types like .exe or .txt', function () {
    const mockFiles = [
      new File(['data'], 'danger.exe', { type: 'application/x-msdownload' }),
      new File(['data'], 'notes.txt', { type: 'text/plain' })
    ] as unknown as FileList;

    const result = filterValidFiles(mockFiles);

    // Should return an empty array
    expect(result.length).toBe(0);
  });

  test('should return an empty array if input is null', function () {
    const result = filterValidFiles(null);
    expect(result).toEqual([]);
  });

  test('should verify the allowed types configuration matches user story 1.2', function () {
    // This ensures no one accidentally removes a required format
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
    expect(ALLOWED_MIME_TYPES).toContain('image/heic');
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
  });

  test('should ignore files with unsupported extensions even if MIME type is empty', function () {
  const mockFiles = [
    new File(['data'], 'unknown.xyz', { type: '' })
  ] as unknown as FileList;

  const result = filterValidFiles(mockFiles);

  expect(result.length).toBe(0);
  });
  
});