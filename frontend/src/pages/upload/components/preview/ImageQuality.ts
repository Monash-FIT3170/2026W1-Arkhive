export type ImageQualityResult = {
  isBlurry: boolean;
  isDark: boolean;
  shouldWarn: boolean;
};

const DARK_THRESHOLD = 70;
const BLUR_THRESHOLD = 2;

function getGrayPixelsFromImageData(imageData: ImageData): {
  gray: number[];
  width: number;
  height: number;
  brightnessScore: number;
} {
  const { data, width, height } = imageData;
  const gray: number[] = [];
  let brightnessTotal = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const value = 0.299 * r + 0.587 * g + 0.114 * b;
    gray.push(value);
    brightnessTotal += value;
  }

  return {
    gray,
    width,
    height,
    brightnessScore: brightnessTotal / gray.length,
  };
}

function getBlurScore(gray: number[], width: number, height: number): number {
  let edgeTotal = 0;
  let edgeCount = 0;

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const idx = y * width + x;
      const rightIdx = y * width + (x + 1);
      const bottomIdx = (y + 1) * width + x;

      const diffX = Math.abs(gray[idx] - gray[rightIdx]);
      const diffY = Math.abs(gray[idx] - gray[bottomIdx]);

      edgeTotal += diffX + diffY;
      edgeCount += 2;
    }
  }

  return edgeCount > 0 ? edgeTotal / edgeCount : 0;
}

export function analyzeImageQualityFromCanvas(canvas: HTMLCanvasElement): ImageQualityResult {
  const context = canvas.getContext("2d");

  if (!context) {
    return {
      isBlurry: false,
      isDark: false,
      shouldWarn: false,
    };
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { gray, width, height, brightnessScore } = getGrayPixelsFromImageData(imageData);
  const blurScore = getBlurScore(gray, width, height);

  const isDark = brightnessScore < DARK_THRESHOLD;
  const isBlurry = blurScore < BLUR_THRESHOLD;

  return {
    isBlurry,
    isDark,
    shouldWarn: isBlurry || isDark,
  };
}

export async function analyzeImageFileQuality(file: File): Promise<ImageQualityResult> {
  const imageBitmap = await createImageBitmap(file);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return {
      isBlurry: false,
      isDark: false,
      shouldWarn: false,
    };
  }

  const maxWidth = 400;
  const scale = Math.min(1, maxWidth / imageBitmap.width);

  canvas.width = Math.max(1, Math.floor(imageBitmap.width * scale));
  canvas.height = Math.max(1, Math.floor(imageBitmap.height * scale));

  context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

  return analyzeImageQualityFromCanvas(canvas);
}