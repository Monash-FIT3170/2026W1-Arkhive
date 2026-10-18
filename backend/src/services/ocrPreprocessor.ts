import sharp from 'sharp';
import { createRequire } from 'module';

let cv: any = null;

export async function prepareForOCR(imageBuffer: Buffer): Promise<Buffer> {
  if (!cv) {
    const require = createRequire(import.meta.url);
    cv = await require('@techstark/opencv-js');
  }

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width === 0 || height === 0) {
      return imageBuffer;
  }

  const rawPixels = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer();

  const src = cv.matFromArray(height, width, cv.CV_8UC4, new Uint8Array(rawPixels));
  const gray = new cv.Mat();
  

  // Convert to grayscale to remove color noise but retain gradients
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // Apply Unsharp Masking to crispen text edges without destroying pixel intensity
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(0, 0), 3);
  cv.addWeighted(gray, 1.5, blurred, -0.5, 0, gray); // crisp up edges

  // Re-encode
  const outBuffer = Buffer.from(gray.data);

  src.delete();
  gray.delete();
  blurred.delete();

  return await sharp(outBuffer, {
    raw: {
      width,
      height,
      channels: 1
    }
  }).png().toBuffer();
}
