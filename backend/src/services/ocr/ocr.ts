import path from 'path';
import vision from '@google-cloud/vision';
import fs, { ReadStream } from 'fs';
import { extractStructuredComponents } from './utils/utils_table_extraction.js';
import { withRetry } from './utils/utils.js';
import LlamaCloud from "@llamaindex/llama-cloud";
import { file } from 'zod';
import { text } from 'stream/consumers';
import { Readable } from 'stream';
import { Uploadable } from "@llamaindex/llama-cloud"; 

const client2 = new LlamaCloud({
  apiKey: process.env.LLAMA_API_KEY,
});

const fileObj = await client2.files.create({
  file: fs.createReadStream("./sample-file-1_page-0001.jpg"),
  purpose: "extract",
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
async function parseTable(imageBuffer: Buffer) {
  const [response] = await client.documentTextDetection(imageBuffer);
  const fullTextAnnotation = response.fullTextAnnotation;
  return extractStructuredComponents(fullTextAnnotation!.pages!);
}

export async function parseTableWithRetries(imageBuffer: Buffer){
  return await withRetry(() => parseTable(imageBuffer))
}

// function for getting overall averaged confidence score

const jsonOut = JSON.stringify(
  await parseTable(fs.readFileSync("./receipt-template-us-classic-white-750px.png")),
  null,
  2
);

fs.writeFileSync("boundingBox.json", jsonOut, "utf-8");

console.log(await textExtraction(fs.readFileSync("./receipt-template-us-classic-white-750px.png")))
