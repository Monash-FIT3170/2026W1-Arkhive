/**
 * Shape of the final assessment returned by the quality checker.
 */
export type ImageQualityResult = {
  isBlurry: boolean;
  isDark: boolean;
  shouldWarn: boolean; // True if the image fails either the brightness or sharpness test
};

// Threshold constants for evaluation. 
// Note: These are baseline metrics and may need tuning based on your specific image set.
const DARK_THRESHOLD = 70; // Out of 255. Lower means darker.
const BLUR_THRESHOLD = 2;   // Average edge contrast. Lower means blurrier.

/**
 * Extracts grayscale values and calculates overall brightness from raw RGBA image data.
 */
function getGrayPixelsFromImageData(imageData: ImageData): {
  gray: number[];
  width: number;
  height: number;
  brightnessScore: number;
} {
  const { data, width, height } = imageData;
  const gray: number[] = [];
  let brightnessTotal = 0;

  // The raw data array is structured as a flat list of RGBA values: [R, G, B, A, R, G, B, A, ...]
  // We jump by 4 to process one pixel at a time.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Index 3 is Alpha (transparency), which is ignored here.

    // Standard NTSC/BT.601 luminance formula to convert RGB to Grayscale.
    // This accounts for human perception (we are more sensitive to green than blue).
    const value = 0.299 * r + 0.587 * g + 0.114 * b;
    
    gray.push(value);
    brightnessTotal += value;
  }

  return {
    gray,
    width,
    height,
    // Average brightness is the sum of all grayscale values divided by the total pixel count.
    brightnessScore: brightnessTotal / gray.length,
  };
}

/**
 * Estimates image blur using a basic simplified Sobel/Laplacian-style edge detection.
 * It measures the intensity difference (contrast) between neighboring pixels.
 */
function getBlurScore(gray: number[], width: number, height: number): number {
  let edgeTotal = 0;
  let edgeCount = 0;

  // Loop through rows and columns, stopping 1 pixel short of the edges to avoid out-of-bounds errors
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      // Map 2D coordinates (x, y) to the 1D flat grayscale array index
      const idx = y * width + x;
      const rightIdx = y * width + (x + 1); // Immediate neighbor to the right
      const bottomIdx = (y + 1) * width + x; // Immediate neighbor directly below

      // Calculate absolute difference in brightness. High difference = sharp edge.
      const diffX = Math.abs(gray[idx] - gray[rightIdx]);
      const diffY = Math.abs(gray[idx] - gray[bottomIdx]);

      edgeTotal += diffX + diffY;
      edgeCount += 2;
    }
  }

  // A high score means sharp transitions (focused image). 
  // A low score means smooth, gradual transitions (blurry image).
  return edgeCount > 0 ? edgeTotal / edgeCount : 0;
}

/**
 * Inspects a canvas element to analyze its pixel data for brightness and clarity.
 */
export function analyzeImageQualityFromCanvas(canvas: HTMLCanvasElement): ImageQualityResult {
  const context = canvas.getContext("2d");

  // Fallback safety if the browser fails to initialize the canvas context
  if (!context) {
    return {
      isBlurry: false,
      isDark: false,
      shouldWarn: false,
    };
  }

  // Extract raw pixel data from the entire dimensions of the canvas
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  
  // 1. Convert to grayscale and get brightness metric
  const { gray, width, height, brightnessScore } = getGrayPixelsFromImageData(imageData);
  
  // 2. Run the grayscale data through the edge-detection algorithm
  const blurScore = getBlurScore(gray, width, height);

  // Evaluate scores against hardcoded thresholds
  const isDark = brightnessScore < DARK_THRESHOLD;
  const isBlurry = blurScore < BLUR_THRESHOLD;

  return {
    isBlurry,
    isDark,
    shouldWarn: isBlurry || isDark,
  };
}

/**
 * Main entry point for analyzing a standard File object (e.g., from an <input type="file">).
 * Downscales the image first to optimize CPU performance during pixel analysis.
 */
export async function analyzeImageFileQuality(file: File): Promise<ImageQualityResult> {
  // Efficiently decodes the image file into a wrapper object without blocking the main UI thread
  const imageBitmap = await createImageBitmap(file);

  // Set up an off-screen canvas to draw and scale down the image
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return {
      isBlurry: false,
      isDark: false,
      shouldWarn: false,
    };
  }

  // Downscale optimization: High-res images take too long to loop through pixel by pixel.
  // We clamp the maximum width to 400px while preserving the aspect ratio.
  const maxWidth = 400;
  const scale = Math.min(1, maxWidth / imageBitmap.width);

  // Ensure dimensions never drop below 1 pixel to prevent canvas errors
  canvas.width = Math.max(1, Math.floor(imageBitmap.width * scale));
  canvas.height = Math.max(1, Math.floor(imageBitmap.height * scale));

  // Draw the image onto the downscaled canvas
  context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

  // Hand off the sized-down canvas to the core analysis functions
  return analyzeImageQualityFromCanvas(canvas);
}