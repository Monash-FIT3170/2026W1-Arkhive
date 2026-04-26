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


// test ocr on 1 png page
export async function testOCR() {
  const text = await textExtraction("assets/sample-page-1.png");

  return {
    success: true,
    text,
  };
}