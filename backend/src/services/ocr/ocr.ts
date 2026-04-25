import path from 'path';
import vision from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.resolve(process.cwd(), 'credentials/google-vision-key.json'),
});

export async function textExtraction(imagePath: string): Promise<string> {
  const absoluteImagePath = path.resolve(imagePath);

  const [result] = await client.documentTextDetection(absoluteImagePath);

  const extractedText = result.fullTextAnnotation?.text ?? '';

  return extractedText;
}

// temporary function to test OCR
export async function extractTextFromSampleImage(): Promise<string> {
    return textExtraction(path.resolve(process.cwd(), 'assets/sample-page-1.png'));
}