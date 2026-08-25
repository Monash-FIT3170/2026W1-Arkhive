import path from 'path';
import vision from '@google-cloud/vision';
import fs from 'fs';
import { extractStructuredComponents } from './utils/utils_table_extraction.js';
import { withRetry } from './utils/utils.js';
import { analyse_result } from './utils/utils_table_extraction_new.js';

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.resolve(
    process.cwd(),
    "../../credentials/google-vision-key.json"
  ),
  features: [
    {
      type: "DOCUMENT_TEXT_DETECTION"
    }
  ],
  imageContext: {
    languageHints: ["en"]
  }
});


/**
 * 
 * THIS NEEDS TO BE REWORKED
 */
export async function textExtraction(buffer: Buffer): Promise<string> {
  const [result] = await client.documentTextDetection({
    image: { content: buffer.toString("base64") }
  });
  return result.fullTextAnnotation?.text ?? "";
}


// test ocr on 1 png page
// export async function testOCR() {
//   const text = await textExtraction("assets/sample-page-1.png");

//   return {
//     success: true,
//     text
//   };
// }

/**


function for getting bounding boxes for all words detected
 @author Harsha Sharma (33879303)
*/  
async function parseTableLegacy(imageBuffer: Buffer) {
  const [response] = await client.documentTextDetection(imageBuffer);
  const fullTextAnnotation = response.fullTextAnnotation;
  return extractStructuredComponents(fullTextAnnotation!.pages!);
}

export async function parseTableWithRetriesLegacy(imageBuffer: Buffer){
  return await withRetry(() => parseTable(imageBuffer))
}

/** 
 @author Harsha Sharma (33879303)
*/  
async function parseTable(imageBuffer: Buffer) {
  return analyse_result(imageBuffer);
}

/*
 @author Harsha Sharma (33879303)
*/  
export async function parseTableWithRetries(imageBuffer: Buffer) {
  return withRetry(() => parseTable(imageBuffer));
}


// function for getting overall averaged confidence score

const jsonOut = JSON.stringify(
 await parseTable(fs.readFileSync("sample-file-1_page-0001.jpg")),
 null,
  2
);

fs.writeFileSync("boundingBox1.json", jsonOut, "utf-8");

await parseTableWithRetries(fs.readFileSync("c:/Users/harsh/OneDrive/Pictures/sample-file-1.pdf"))

