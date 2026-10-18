import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { processImage } from './imageProcessor';
// This test file was generated with the assistance of Google Gemini.
describe('imageProcessor service', () => {
  it('processes normal high-contrast image without warning flags', async () => {
    // 200x200 image split in half (black / white) has high edge contrast (sharp) and mean brightness ~127
    const svg = Buffer.from(`
      <svg width="200" height="200">
        <rect width="100" height="200" fill="black" />
        <rect x="100" width="100" height="200" fill="white" />
      </svg>
    `);

    const inputBuffer = await sharp(svg).png().toBuffer();
    const result = await processImage(inputBuffer);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.qualityFlags).toEqual({
      isBlurry: false,
      isDark: false,
      isInvalidSize: false,
      shouldWarn: false,
    });
  });

  it('detects dark images below brightness threshold', async () => {
    // 100x100 almost black image
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .png()
      .toBuffer();

    const result = await processImage(inputBuffer);

    expect(result.qualityFlags.isDark).toBe(true);
    expect(result.qualityFlags.shouldWarn).toBe(true);
  });

  it('detects uniform/blurry images with low Laplacian variance', async () => {
    // Uniform gray surface has 0 Laplacian variance (< 2 threshold)
    const inputBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 180, g: 180, b: 180 },
      },
    })
      .png()
      .toBuffer();

    const result = await processImage(inputBuffer);

    expect(result.qualityFlags.isBlurry).toBe(true);
    expect(result.qualityFlags.isDark).toBe(false);
    expect(result.qualityFlags.shouldWarn).toBe(true);
  });

  it('detects tiny images smaller than 50x50 minimum dimension', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 200, g: 200, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const result = await processImage(inputBuffer);

    expect(result.qualityFlags.isInvalidSize).toBe(true);
    expect(result.qualityFlags.shouldWarn).toBe(true);
  });

  it('resizes oversized images down within 2000x2000 bounding box', async () => {
    const inputBuffer = await sharp({
      create: {
        width: 2400,
        height: 1200,
        channels: 3,
        background: { r: 150, g: 150, b: 150 },
      },
    })
      .png()
      .toBuffer();

    const result = await processImage(inputBuffer);
    const metadata = await sharp(result.buffer).metadata();

    expect(metadata.width).toBeLessThanOrEqual(2000);
    expect(metadata.height).toBeLessThanOrEqual(2000);
    expect(metadata.format).toBe('png');
  });

  it('throws error when input buffer is invalid/corrupt', async () => {
    const corruptBuffer = Buffer.from('this is completely invalid image data');
    await expect(processImage(corruptBuffer)).rejects.toThrow();
  });
});
