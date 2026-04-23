import path from 'path';
import vision from '@google-cloud/vision';

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.resolve(process.cwd(), 'credentials/google-vision-key.json'),
});

export async function extractTextFromSampleImage(): Promise<string> {
  const imagePath = path.resolve(process.cwd(), 'assets/sample-page-1.png');

  const [result] = await client.documentTextDetection(imagePath);

  const extractedText = result.fullTextAnnotation?.text ?? '';

  return extractedText;
}