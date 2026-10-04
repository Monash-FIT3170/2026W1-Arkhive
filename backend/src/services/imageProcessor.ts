import sharp from 'sharp';
import { createRequire } from 'module';

let cv: any = null;

export interface QualityFlags {
  isBlurry: boolean;
  isDark: boolean;
  isInvalidSize: boolean;
  shouldWarn: boolean;
}

export interface ProcessedImage {
  buffer: Buffer;        // Optimized PNG buffer
  qualityFlags: QualityFlags;
}

const DARK_THRESHOLD = 70;
const BLUR_THRESHOLD = 2; // Laplacian variance

export async function processImage(inputBuffer: Buffer): Promise<ProcessedImage> {
  // 1. Resize and compress using sharp
  const optimizedBuffer = await sharp(inputBuffer)
    .resize(2000, 2000, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  // 2. Read dimensions from optimized buffer
  const metadata = await sharp(optimizedBuffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const isInvalidSize = width < 50 || height < 50;

  // 3. OpenCV Quality Analysis
  if (!cv) {
    const require = createRequire(import.meta.url);
    cv = await require('@techstark/opencv-js');
  }

  // Use raw RGBA pixel data to create OpenCV Mat
  const rawPixels = await sharp(optimizedBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer();

  const src = cv.matFromArray(height, width, cv.CV_8UC4, new Uint8Array(rawPixels));
  const gray = new cv.Mat();
  
  // Convert to grayscale
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  
  // Calculate mean brightness
  const meanScalar = cv.mean(gray);
  const brightness = meanScalar[0];
  const isDark = brightness < DARK_THRESHOLD;

  // Calculate blur using Laplacian variance
  const laplacian = new cv.Mat();
  cv.Laplacian(gray, laplacian, cv.CV_64F);
  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  cv.meanStdDev(laplacian, mean, stddev);
  
  // Variance is standard deviation squared
  const variance = Math.pow(stddev.data64F[0], 2);
  const isBlurry = variance < BLUR_THRESHOLD;

  // Clean up OpenCV mats
  src.delete();
  gray.delete();
  laplacian.delete();
  mean.delete();
  stddev.delete();

  const qualityFlags: QualityFlags = {
    isBlurry,
    isDark,
    isInvalidSize,
    shouldWarn: isBlurry || isDark || isInvalidSize,
  };

  return {
    buffer: optimizedBuffer,
    qualityFlags,
  };
}
