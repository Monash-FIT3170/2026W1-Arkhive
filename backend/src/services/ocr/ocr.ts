import path from 'path';
import vision from '@google-cloud/vision';
import fs from 'fs';
import { extractStructuredComponents } from './utils/utils_table_extraction.js';
import { withRetry } from './utils/utils.js';



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

export async function textExtraction(imagePath: string): Promise<string> {
  try {
    const absoluteImagePath = path.resolve(imagePath);

    const [result] = await client.documentTextDetection(absoluteImagePath);

    const extractedText = result.fullTextAnnotation?.text ?? '';

    return extractedText;
  } catch (e: any){
    console.log("Request failed. Error " + e + " occured")
    return "";
  }
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
async function parseTable(imageBuffer: Buffer) {
  const [response] = await client.documentTextDetection(imageBuffer);
  const fullTextAnnotation = response.fullTextAnnotation;
  return extractStructuredComponents(fullTextAnnotation!.pages!)
}

async function parseTableWithRetries(imageBuffer: Buffer){
  return await withRetry(() => parseTable(imageBuffer))
}

// function for getting overall averaged confidence score

// const jsonOut = JSON.stringify(await parseTableWithRetries(fs.readFileSync("sample-file-1_page-0001.jpg")), null, 2)

// fs.writeFileSync("boundingBox.json", jsonOut, 'utf-8')