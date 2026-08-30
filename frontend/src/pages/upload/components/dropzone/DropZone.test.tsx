import { describe, test, expect } from 'vitest';
import {
  filterValidFiles,
  partitionBySize,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from './dropZoneUtils';

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

  test('should filter out invalid files and keep only valid ones in mixed input', function () {
  const mockFiles = [
    new File(['data'], 'valid.pdf', { type: 'application/pdf' }),
    new File(['data'], 'invalid.exe', { type: 'application/x-msdownload' })
  ] as unknown as FileList;

  const result = filterValidFiles(mockFiles);

  expect(result.length).toBe(1);
  expect(result[0].name).toBe('valid.pdf');
  });

  test('should accept a file smaller than the 5MB limit', function () {
  const smallFile = new File(
    [new Uint8Array(1024)],
    'small.pdf',
    { type: 'application/pdf' }
  );

  const result = partitionBySize([smallFile]);

  expect(result.accepted.length).toBe(1);
  expect(result.rejected.length).toBe(0);
  });

  test('should accept a file exactly at the 5MB limit', function () {
  const exactLimitFile = new File(
    [new Uint8Array(MAX_FILE_SIZE_BYTES)],
    'exact-limit.pdf',
    { type: 'application/pdf' }
  );

  const result = partitionBySize([exactLimitFile]);

  expect(result.accepted.length).toBe(1);
  expect(result.rejected.length).toBe(0);
  });

  test('should reject a file larger than the 5MB limit', function () {
  const oversizedFile = new File(
    [new Uint8Array(MAX_FILE_SIZE_BYTES + 1)],
    'too-large.pdf',
    { type: 'application/pdf' }
  );

  const result = partitionBySize([oversizedFile]);

  expect(result.accepted.length).toBe(0);
  expect(result.rejected.length).toBe(1);
  });

  test('should separate valid-size and oversized files', function () {
  const smallFile = new File(
    [new Uint8Array(1024)],
    'small.pdf',
    { type: 'application/pdf' }
  );

  const oversizedFile = new File(
    [new Uint8Array(MAX_FILE_SIZE_BYTES + 1)],
    'large.pdf',
    { type: 'application/pdf' }
  );

  const result = partitionBySize([smallFile, oversizedFile]);

  expect(result.accepted).toContain(smallFile);
  expect(result.rejected).toContain(oversizedFile);
  });


});