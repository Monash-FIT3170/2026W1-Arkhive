
//importing google vision
import something from '@google-cloud/vision'
import fs from 'fs'
import { findAverageAccuracyForAllWords, flattenPagesToWordMap } from './utils/utils.js';
import { OCRBoundingBoxes }from './types/boundingBoxTypes.js';
//creating new client using JSON credentials


//creating a client

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