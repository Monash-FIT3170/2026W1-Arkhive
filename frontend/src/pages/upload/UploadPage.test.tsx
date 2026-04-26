import { describe, test, expect } from 'vitest';
import { calculateNewFilesStore } from './UploadPage';

/**
 * UploadPage Logic Verification
 * * This suite tests the actual "Store" logic implementation exported from UploadPage.
 */
describe('UploadPage Business Logic', function () {

  test('calculateNewFilesStore: should correctly append new files to an empty store', function () {
    const initialStore: File[] = [];
    const newFiles = [new File(['data'], 'test.pdf', { type: 'application/pdf' })];

    // Testing the actual function implementation
    const result = calculateNewFilesStore(initialStore, newFiles);

    expect(result.length).toBe(1);
    expect(result[0].name).toBe('test.pdf');
  });

  test('calculateNewFilesStore: should preserve existing files when adding new ones', function () {
    const existingFile = new File(['1'], 'existing.png', { type: 'image/png' });
    const incomingFile = new File(['2'], 'new.jpg', { type: 'image/jpeg' });

    const result = calculateNewFilesStore([existingFile], [incomingFile]);

    // Verifies that the "Store" logic doesn't overwrite current data
    expect(result.length).toBe(2);
    expect(result[0].name).toBe('existing.png');
    expect(result[1].name).toBe('new.jpg');
  });

  test('Behavioral check: should return empty store if both inputs are empty', function () {
    const result = calculateNewFilesStore([], []);
    expect(result).toEqual([]);
  });

});