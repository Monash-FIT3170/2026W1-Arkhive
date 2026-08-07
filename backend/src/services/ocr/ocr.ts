import path from 'path';
import vision from '@google-cloud/vision';
import fs from 'fs';
import { extractStructuredComponents } from './utils/utils_table_extraction.js';
import { withRetry } from './utils/utils.js';
import LlamaCloud from "@llamaindex/llama-cloud";
import { convertTable } from './utils/utils_table_extraction_new.js';


const client2 = new LlamaCloud({
  apiKey: process.env.LLAMA_API_KEY,
});

/*const result = await client2.extract.create({
  file_input: fileObj.id,
  configuration: {
      data_schema: dataSchemaExtract,
      extraction_target: 'per_doc',
      tier: "cost_effective",
      confidence_scores: true,
  },
});*/

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

export async function textExtraction(buffer: Buffer): Promise<string> {
  /*const [result] = await client.documentTextDetection({
  /*const [result] = await client.documentTextDetection({
    image: { content: buffer.toString("base64") }
  });*/
  const readableStream = fs.createReadStream(buffer)

  const fileObj = await client2.files.create({
  file: readableStream,
  purpose: "extract",
});

  const result = await client2.parsing.parse({
  file_id: fileObj.id,
  tier: "fast",
  expand: ["markdown_full", "metadata"],
  version: "latest",
  output_options: {
    granular_bboxes: ["cell"]
  }})

  client2.files.delete(fileObj.id)

  return result.markdown_full ?? "";
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

export async function parseTableWithRetries(imageBuffer: Buffer){
  return await withRetry(() => parseTable(imageBuffer))
}

/*
 @author Harsha Sharma (33879303)
*/  
async function parseTable(imageBuffer: Buffer) {
  const [response] = await client.documentTextDetection(imageBuffer);
  const fullTextAnnotation = response.fullTextAnnotation;
  return extractStructuredComponents(fullTextAnnotation!.pages!);
}


// function for getting overall averaged confidence score

//const jsonOut = JSON.stringify(
//  await parseTable(fs.readFileSync("c:/Users/harsh/OneDrive/Pictures/sample-file-1.pdf")),
//  null,
//  2
//);

//fs.writeFileSync("boundingBox.json", jsonOut, "utf-8");

await convertTable(fs.readFileSync("c:/Users/harsh/OneDrive/Pictures/sample-file-1.pdf"), client2)
