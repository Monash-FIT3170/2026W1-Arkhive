import DocumentIntelligence, { type DocumentFieldOutput, type DocumentPageOutput, type DocumentTableCellKindOutput, type DocumentTableCellOutput, type DocumentTableOutput, type DocumentWordOutput } from "@azure-rest/ai-document-intelligence";
import { getLongRunningPoller, isUnexpected, type DocumentIntelligenceClient, type AnalyzeOperationOutput } from "@azure-rest/ai-document-intelligence";
import fs from "fs"
import { GoogleGenAI } from "@google/genai";
import { OCRComponent, OCRBoundingBoxes, Vertex, geminiSchemaBBoxPrompt } from "../types/boundingBoxTypes";

const ai = new GoogleGenAI({
  apiKey: "nope"
});

const endpoint = "https://jonmeraqsadilam.cognitiveservices.azure.com";
const key = "nope";

/**
 *
 *
 * @param {AnalyzeOperationOutput} OCRResponse
 * @return {*} 
 * @author Harsha Sharma 33879303
 */
function pruneOCROutput(OCRResponse: AnalyzeOperationOutput): any{
  const result = OCRResponse.analyzeResult;
  if (!result) return {};

  return {
    content: result.content, // Raw text content
    tables: result.tables?.map((table) => ({
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      cells: table.cells.map((cell) => ({
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        content: cell.content,
        kind: cell.kind,
      })),
      pages: result.pages?.map((page) => ({
      pageNumber: page.pageNumber,
      words: page.words?.map((word) => ({
        content: word.content,
        confidence: word.confidence,
        polygon: word.polygon,
        span: word.span,
      })),
    })),
  }))
  };
}

/**
 * 
 * @param OCRResponse 
 * @returns 
 */
const mapTablesToOCRComponents = (customSchema: any) => async (
  OCRResponse: AnalyzeOperationOutput
): Promise<any> => {
  console.log("i like something bruv")
  const structuredOutput = await ai.interactions.create({
    model: "gemini-3.5-flash-lite", 
    input: [
      {
        type: "text",
        text: `Analyze the following Azure Document Intelligence layout output and convert it into structured components.
               
               Mapping Guidelines:
               - Map section headings/titles to 'TITLE' or 'HEADER'.
               - Map table rows/cells to 'TABLE_ROW' or 'TABLE_COLS' and populate the 'cells' string array.
               - Map standard paragraphs to 'BODY_TEXT'.
               - Calculate visual 'y' coordinates and 'indentation' based on the bounding region points.
               - if TABLE_ROW, determine layer by checking indentation, if layer > 1, find and assign parent row id
               - Store line/word level bounding boxes in the boundingBoxes array format.`,
      },
      {
        type: "text",
        text: JSON.stringify(pruneOCROutput(OCRResponse)),
      },
    ],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: customSchema
    }
  })
  const rawText = structuredOutput.output_text ?? "{}"
  const parsed = JSON.parse(rawText) as { components: OCRComponent[] };
  return parsed.components;
}

const client: DocumentIntelligenceClient = DocumentIntelligence(endpoint, {key: key}, { apiVersion: "2024-11-30" })
export async function analyse_result(buffer: Buffer) {
  const request = await client.path("/documentModels/{modelId}:analyze", "prebuilt-layout").post({
    contentType: "application/pdf",
    body: buffer
  });

  if (isUnexpected(request)){
    throw request.body.error;
  }

  const poller = getLongRunningPoller(client, request);
  const response = await poller.pollUntilDone();

  const result = response.body as AnalyzeOperationOutput;
  const defaultOutputFunc = await mapTablesToOCRComponents(geminiSchemaBBoxPrompt)
  const processedOut = defaultOutputFunc(result)
  fs.writeFileSync("smthToWorkWithPotentially.json", JSON.stringify(processedOut, null, 2))
  return processedOut
}

await analyse_result(fs.readFileSync("C:/Users/harsh/OneDrive/Pictures/invoice-template-us-dexter-750px.png"))