import { describe, expect, test } from 'vitest';
import { hasValidFileSignature } from './fileValidation';

describe('hasValidFileSignature', () => {
    test('accepts a valid PNG signature', () => {
        const pngBytes = new Uint8Array([
            0x89,0x50,0x4e,0x47,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00
        ]);

        const result = hasValidFileSignature(
            pngBytes,
            'image/png'
        );

        expect(result).toBe(true);
    });

    test('rejects a fake PNG with invalid file signature', () => {
    const fakePngBytes = new Uint8Array([
        0x00, 0x11, 0x22, 0x33,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00
    ]);

    const result = hasValidFileSignature(
        fakePngBytes,
        'image/png'
    );

    expect(result).toBe(false);
    });

    test('accepts a valid JPEG signature', () => {
    const jpegBytes = new Uint8Array([
        0xff,0xd8,0xff,0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00
    ]);

    const result = hasValidFileSignature(
        jpegBytes,
        'image/jpeg'
    );

    expect(result).toBe(true);
    });

    test('rejects files that are too short', () => {
        const shortFile = new Uint8Array([
            0x89,
            0x50
        ]);

        const result = hasValidFileSignature(
            shortFile,
            'image/png'
        );

        expect(result).toBe(false);
    });

        test('accepts a valid little-endian TIFF signature', () => {
        const tiffBytes = new Uint8Array([
            0x49, 0x49, 0x2a, 0x00,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00
        ]);

        expect(hasValidFileSignature(tiffBytes, 'image/tiff')).toBe(true);
    });

    test('accepts a valid big-endian TIFF signature', () => {
        const tiffBytes = new Uint8Array([
            0x4d, 0x4d, 0x00, 0x2a,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00
        ]);

        expect(hasValidFileSignature(tiffBytes, 'image/tiff')).toBe(true);
    });

    test('accepts a valid WebP signature', () => {
        const webpBytes = new Uint8Array([
            0x52, 0x49, 0x46, 0x46, // RIFF
            0x00, 0x00, 0x00, 0x00,
            0x57, 0x45, 0x42, 0x50  // WEBP
        ]);

        expect(hasValidFileSignature(webpBytes, 'image/webp')).toBe(true);
    });

    test('accepts a valid HEIC signature', () => {
        const heicBytes = new Uint8Array([
            0x00, 0x00, 0x00, 0x18,
            0x66, 0x74, 0x79, 0x70, // ftyp
            0x68, 0x65, 0x69, 0x63  // heic
        ]);

        expect(hasValidFileSignature(heicBytes, 'image/heic')).toBe(true);
    });

    test('accepts a valid HEIF signature', () => {
        const heifBytes = new Uint8Array([
            0x00, 0x00, 0x00, 0x18,
            0x66, 0x74, 0x79, 0x70, // ftyp
            0x6d, 0x69, 0x66, 0x31  // mif1
        ]);

        expect(hasValidFileSignature(heifBytes, 'image/heif')).toBe(true);
    });
});