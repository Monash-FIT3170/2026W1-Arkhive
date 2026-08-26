import path from 'path';
import vision from '@google-cloud/vision';
import fs from 'fs';
import { extractStructuredComponents } from './utils/legacy_utils_table_extraction.js';
import { withRetry } from './utils/utils.js';
import { analyse_result } from './utils/utils_table_extraction_new.js';

/**
 * @author Aryan Cyrus (33114242)
 * Initializes the Google Cloud Vision client with the necessary credentials.
 *
 * We are when deploying one needs to add env variables to hosting platform BUT:
 * - Render does not take JSON env variables, so we need to
 *   convert the JSON to base64 and then decode it back to JSON in the code.
 *
 * So all render sees is: GOOGLE_CREDENTIALS_BASE64 = <base64 encoded JSON>
 */
const localCredsPath = path.resolve(
  process.cwd(),
  "../backend/src/credentials/google-vision-key.json"
);
const tempCredsPath = path.join("/tmp", "google-vision-key.json");

let credsPath: string;

if (process.env.GOOGLE_CREDENTIALS_BASE64) {
  // Render (or any host with the base64 env var set): decode to /tmp
  fs.writeFileSync(
    tempCredsPath,
    Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, "base64")
  );
  credsPath = tempCredsPath;
} else {
  // Local dev: use the JSON file already sitting in the repo
  credsPath = localCredsPath;
}

const client = new vision.ImageAnnotatorClient({
  keyFilename: credsPath,
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
    image: { content: buffer}
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
  if (!fullTextAnnotation || !fullTextAnnotation.pages) {
    throw new Error("NoTextDetectedError: OCR did not detect any text. Please double check or reupload your document.");
  }
  return extractStructuredComponents(fullTextAnnotation.pages);
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
/*
const jsonOut = JSON.stringify(
 await parseTable(fs.readFileSync("sample-file-1_page-0001.jpg")),
 null,
  2
);

fs.writeFileSync("boundingBox1.json", jsonOut, "utf-8");

await parseTableWithRetries(fs.readFileSync("c:/Users/harsh/OneDrive/Pictures/sample-file-1.pdf")) */

