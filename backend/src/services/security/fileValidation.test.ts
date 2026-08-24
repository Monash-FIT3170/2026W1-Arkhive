import { describe, expect, test } from 'vitest';
import { hasValidFileSignature } from './fileValidation';

describe('hasValidFileSignature', () => {
    test('accepts a valid PNG signature', () => {
        const pngBytes = new Uint8Array([
            0x89,
            0x50,
            0x4e,
            0x47
        ]);

        const result = hasValidFileSignature(
            pngBytes,
            'image/png'
        );

        expect(result).toBe(true);
    });

    test('rejects a fake PNG with invalid file signature', () => {
    const fakePngBytes = new Uint8Array([
        0x00,
        0x11,
        0x22,
        0x33
    ]);

    const result = hasValidFileSignature(
        fakePngBytes,
        'image/png'
    );

    expect(result).toBe(false);
    });

    test('accepts a valid JPEG signature', () => {
    const jpegBytes = new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0x00
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
});