import path from 'path';
import vision from '@google-cloud/vision';
import something from '@google-cloud/vision'
import fs from 'fs'
import { findAverageAccuracyForAllWords, flattenPagesToWordMap } from './utils/utils.js';
import { OCRBoundingBoxes }from './types/boundingBoxTypes.js';

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.resolve(process.cwd(), 'credentials/google-vision-key.json'),
});

export async function extractTextFromSampleImage(): Promise<string> {
  const imagePath = path.resolve(process.cwd(), 'assets/sample-page-1.png');

  const [result] = await client.documentTextDetection(imagePath);

  const extractedText = result.fullTextAnnotation?.text ?? '';

  return extractedText;
}


//creating new client using JSON credentials

const API_KEY = JSON.parse(fs.readFileSync(process.env.API_SECRET!, 'utf-8'));

const visionClient = new something.ImageAnnotatorClient({ credentials: API_KEY})


// function for getting bounding boxes for all words detected and drawing a
//  
async function getBoundingBoxes(imageBuffer: Buffer) {
  
  const [response] = await visionClient.documentTextDetection(imageBuffer);
  const fullTextAnnotation = response.fullTextAnnotation;
  return flattenPagesToWordMap(fullTextAnnotation!.pages!)
}

// function for getting overall averaged confidence score for all words
async function getAverageConfidenceScore(imageBuffer: Buffer) {

  const [response] = await visionClient.documentTextDetection(imageBuffer);
  const fullTextAnnotation = response.fullTextAnnotation;
  return findAverageAccuracyForAllWords(fullTextAnnotation?.pages!);
}


function drawBoundingBoxes(imageBuffer: Buffer, OCRBoundingBoxes: OCRBoundingBoxes){};

// function for getting overall averaged confidence score

const jsonOut = JSON.stringify(await getBoundingBoxes(fs.readFileSync("Screenshot 2026-04-25 195541.png")), null, 2)

fs.writeFileSync("boundingBox.json", jsonOut, 'utf-8')