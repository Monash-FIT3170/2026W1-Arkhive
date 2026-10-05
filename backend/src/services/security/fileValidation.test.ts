import { describe, it, expect } from 'vitest';
import { hasValidFileSignature, isAllowedR2UploadContentType } from './fileValidation';

/** Pad to 12 bytes so the length guard is not what fails the test. */
function bytes(...values: number[]): Uint8Array {
  const buffer = new Uint8Array(12);
  buffer.set(values);
  return buffer;
}

const PNG = bytes(0x89, 0x50, 0x4e, 0x47);
const JPEG = bytes(0xff, 0xd8, 0xff);
const TIFF_LE = bytes(0x49, 0x49, 0x2a, 0x00);
const TIFF_BE = bytes(0x4d, 0x4d, 0x00, 0x2a);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
const HEIC = bytes(0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63);

describe('hasValidFileSignature', () => {
  it('accepts a real PNG labelled as image/png', () => {
    expect(hasValidFileSignature(PNG, 'image/png')).toBe(true);
  });

  it('accepts a real JPEG labelled as image/jpeg', () => {
    expect(hasValidFileSignature(JPEG, 'image/jpeg')).toBe(true);
  });

  it('accepts little-endian and big-endian TIFF', () => {
    expect(hasValidFileSignature(TIFF_LE, 'image/tiff')).toBe(true);
    expect(hasValidFileSignature(TIFF_BE, 'image/tiff')).toBe(true);
  });

  it('accepts a real WebP labelled as image/webp', () => {
    expect(hasValidFileSignature(WEBP, 'image/webp')).toBe(true);
  });

  it('accepts HEIC/HEIF brands labelled as image/heic or image/heif', () => {
    expect(hasValidFileSignature(HEIC, 'image/heic')).toBe(true);
    expect(hasValidFileSignature(HEIC, 'image/heif')).toBe(true);
  });

  it('rejects fake bytes labelled as image/png', () => {
    const fake = Buffer.from('fake-image-bytes');
    expect(hasValidFileSignature(fake, 'image/png')).toBe(false);
  });

  it('rejects a JPEG that is labelled as a PNG', () => {
    expect(hasValidFileSignature(JPEG, 'image/png')).toBe(false);
  });

  it('rejects unknown MIME types even with valid PNG bytes', () => {
    expect(hasValidFileSignature(PNG, 'application/octet-stream')).toBe(false);
    expect(hasValidFileSignature(PNG, 'application/pdf')).toBe(false);
  });

  it('rejects buffers shorter than 12 bytes', () => {
    expect(hasValidFileSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBe(
      false
    );
  });
});

describe('isAllowedR2UploadContentType', () => {
  it('allows image/png', () => {
    expect(isAllowedR2UploadContentType('image/png')).toBe(true);
  });

  it('rejects PDF, HTML, and JPEG labels', () => {
    expect(isAllowedR2UploadContentType('application/pdf')).toBe(false);
    expect(isAllowedR2UploadContentType('text/html')).toBe(false);
    expect(isAllowedR2UploadContentType('image/jpeg')).toBe(false);
  });
});
