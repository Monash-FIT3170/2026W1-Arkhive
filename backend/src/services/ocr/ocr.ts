import path from 'path';
import vision from '@google-cloud/vision';
import fs from 'fs';
import { extractStructuredComponents } from './utils/utils_table_extraction.js';
import { withRetry } from './utils/utils.js';

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
const credsPath = path.join("/tmp", "google-vision-key.json");
fs.writeFileSync(credsPath, Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64!, "base64"));
process.env.GOOGLE_APPLICATION_CREDENTIALS = credsPath;

const client = new vision.ImageAnnotatorClient({
  keyFilename: path.resolve(
    process.cwd(),
    "./temp/google-vision-key.json"
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

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

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
async function parseTable(imageBuffer: Buffer) {
  const [response] = await client.documentTextDetection(imageBuffer);
  const fullTextAnnotation = response.fullTextAnnotation;
  return extractStructuredComponents(fullTextAnnotation!.pages!);
}

export async function parseTableWithRetries(imageBuffer: Buffer) {
  return await withRetry(() => parseTable(imageBuffer))
}

// function for getting overall averaged confidence score

const jsonOut = JSON.stringify(
  await parseTable(fs.readFileSync("assets/sample-page-1.png")),
  null,
  2
);

fs.writeFileSync("boundingBox.json", jsonOut, "utf-8");
