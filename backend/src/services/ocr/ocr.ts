import path from 'path';
import vision from '@google-cloud/vision';
import fs from 'fs'
import { extractStructuredComponents, findAverageAccuracyForAllWords, flattenPagesToBlockMap, flattenPagesToParaMap, flattenPagesToWordMap } from './utils/utils.js';
import { OCRBoundingBoxes } from './types/boundingBoxTypes.js';
import { pdf } from 'pdf-to-img';




const client = new vision.ImageAnnotatorClient({
  keyFilename: path.resolve(process.cwd(), '../../credentials/google-vision-key.json'),
  features: [
    {
      type: 'DOCUMENT_TEXT_DETECTION',
    },
  ],
  imageContext: {
    languageHints: ['en'],
  }
});

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

// Extracts raw OCR text using Google Vision's fullTextAnnotation
export async function textExtraction(imagePath: string): Promise<string> {
  const absoluteImagePath = path.resolve(imagePath);

  const [result] = await client.documentTextDetection(absoluteImagePath);

  const extractedText = result.fullTextAnnotation?.text ?? '';
  console.log("[OCR] rawText generated:", extractedText);

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


/* 


function for getting bounding boxes for all words detected
*/
async function getBoundingBoxesWords(imageBuffer: Buffer) {

  //const pages = mimeType == "application/pdf" ? pdf(imageBuffer) : imageBuffer



  const [response] = await client.documentTextDetection(imageBuffer);
  const fullTextAnnotation = response.fullTextAnnotation;
  return extractStructuredComponents(fullTextAnnotation!.pages!)
}

// function for getting overall averaged confidence score

const imagePath = "Screenshot 2026-04-25 195541.png";
// Support for raw OCR text alongside existing structured pipeline
const rawText = await textExtraction(imagePath);
const jsonOut = JSON.stringify(await getBoundingBoxesWords(fs.readFileSync(imagePath)), null, 2);

fs.writeFileSync("boundingBox.json", jsonOut, 'utf-8');