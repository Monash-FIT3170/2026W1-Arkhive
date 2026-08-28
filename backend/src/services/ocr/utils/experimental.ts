import DocumentIntelligence, {
  type DocumentFieldOutput,
  type DocumentPageOutput,
  type DocumentTableCellKindOutput,
  type DocumentTableCellOutput,
  type DocumentTableOutput,
  type DocumentWordOutput,
} from '@azure-rest/ai-document-intelligence';
import {
  getLongRunningPoller,
  isUnexpected,
  type DocumentIntelligenceClient,
  type AnalyzeOperationOutput,
} from '@azure-rest/ai-document-intelligence';
import fs from 'fs';
import { GoogleGenerativeAI, Schema } from '@google/generative-ai';
import {
  OCRComponent,
  OCRBoundingBoxes,
  Vertex,
  geminiSchemaBBoxPrompt,
  OCRColumnBoundingBoxes,
  Pages,
  Page,
} from '../types/boundingBoxTypes';

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const endpoint = process.env.endpoint!;
const key = process.env.AZURE_CLOUD_API_KEY!;


function pruneOCROutput(OCRResponse: AnalyzeOperationOutput): any {
  const result = OCRResponse.analyzeResult;
  if (!result) return {};

  const allWords = result.pages?.flatMap((page) => page.words ?? []) ?? [];

  const wordsInSpan = (span?: { offset: number; length: number }) => {
    if (!span) return [];
    return allWords
      .filter(
        (w) =>
          w.span.offset >= span.offset && w.span.offset + w.span.length <= span.offset + span.length
      )
      .map((w) => ({ content: w.content, confidence: w.confidence, polygon: w.polygon }));
  };

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
        boundingRegions: cell.boundingRegions,
        // NEW: word-level polygons for the text inside this cell —
        // use these (not boundingRegions above) to judge real indentation.
        words: wordsInSpan(cell.spans?.[0]),
      })),
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
  };
}




function pruneOCROutput111(OCRResponse: AnalyzeOperationOutput, tablesInPage: DocumentTableOutput[]): any {
  const result = OCRResponse.analyzeResult;
  if (!result) return {};

  const allWords = result.pages?.flatMap((page) => page.words ?? []) ?? [];

  const wordsInSpan = (span?: { offset: number; length: number }) => {
    if (!span) return [];
    return allWords
      .filter(
        (w) =>
          w.span.offset >= span.offset && w.span.offset + w.span.length <= span.offset + span.length
      )
      .map((w) => ({ content: w.content, confidence: w.confidence, polygon: w.polygon }));
  };

  return {
    content: result.content, // Raw text content
    tables: tablesInPage.map((table) => ({
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      cells: table.cells.map((cell) => ({
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        content: cell.content,
        kind: cell.kind,
        boundingRegions: cell.boundingRegions,
        // NEW: word-level polygons for the text inside this cell —
        // use these (not boundingRegions above) to judge real indentation.
        words: wordsInSpan(cell.spans?.[0]),
      })),
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
  };
}

function toColumnDict(boxes: any[]): OCRColumnBoundingBoxes {
  return Object.fromEntries(
    boxes.map((b) => [
      b.columnKey,
      { text: b.text, column: b.column, vertices: b.vertices, confidence: b.confidence },
    ])
  );
}

const initialiseModel = (customSchema: Schema) => {
  return ai.getGenerativeModel({
      model: 'gemini-flash-lite-latest',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: customSchema,
      },
    });
}

const createPrompt = (OCRResponse: AnalyzeOperationOutput) => {
  return `Analyze the following Azure Document Intelligence layout output and convert it into structured components.
               
               Mapping Guidelines:
               - Map section headings/titles to 'TITLE' or 'HEADER'.
               - Map table rows/cells to 'TABLE_ROW' or 'TABLE_COLS' and populate the 'cells' string array.
               - Map standard paragraphs to 'BODY_TEXT'.
               - Calculate visual 'y' coordinates and 'indentation' based on the bounding region points.
               - IMPORTANT: a cell's own boundingRegions box is coarse and does NOT shrink when its text is nested/indented — Azure draws the same cell-sized box either way. To determine true indentation, use each cell's "words" array instead and take the leftmost x-coordinate of the word polygons. Compare that leftmost x across rows in the same table to decide nesting.
               - if TABLE_ROW, determine layer by checking indentation (via word polygons, not cell boxes), if layer > 1, find and assign parent row id (the nearest preceding row with smaller indentation).
               - Store bounding boxes per table column, keyed like "col_0", "col_1", etc. (one entry per column present in that row), each with the column's text, a "column" label (e.g. "Column 0"), its vertices, and confidence.

${JSON.stringify(pruneOCROutput(OCRResponse))}`;
}


const createPrompt11 = (OCRResponse: AnalyzeOperationOutput, tablesInPage: DocumentTableOutput[]) => {
  return `Analyze the following Azure Document Intelligence layout output and convert it into structured components.
               
               Mapping Guidelines:
               - Map section headings/titles to 'TITLE' or 'HEADER'.
               - Map table rows/cells to 'TABLE_ROW' or 'TABLE_COLS' and populate the 'cells' string array.
               - Map standard paragraphs to 'BODY_TEXT'.
               - Calculate visual 'y' coordinates and 'indentation' based on the bounding region points.
               - IMPORTANT: a cell's own boundingRegions box is coarse and does NOT shrink when its text is nested/indented — Azure draws the same cell-sized box either way. To determine true indentation, use each cell's "words" array instead and take the leftmost x-coordinate of the word polygons. Compare that leftmost x across rows in the same table to decide nesting.
               - if TABLE_ROW, determine layer by checking indentation (via word polygons, not cell boxes), if layer > 1, find and assign parent row id (the nearest preceding row with smaller indentation).
               - Store bounding boxes per table column, keyed like "col_0", "col_1", etc. (one entry per column present in that row), each with the column's text, a "column" label (e.g. "Column 0"), its vertices, and confidence.

${JSON.stringify(pruneOCROutput111(OCRResponse, tablesInPage))}`;
}


function logTablePages(result: AnalyzeOperationOutput) {
  result.analyzeResult!.tables?.forEach((table, index) => {
    // Collect all unique 1-based page numbers the table covers
    const pageNumbers = table.boundingRegions?.map(region => region.pageNumber) || [];
    
    console.log(`Table #${index} spans across page(s): ${pageNumbers.join(", ")}`);
  });
}

export const mapOCRtoPages = (customSchema: Schema) => async (OCRResponse: AnalyzeOperationOutput): Promise<Pages> => {
  const smth = await Promise.all(
  (OCRResponse.analyzeResult?.pages ?? []).map(async (page) => {
    // Filter tables that belong to the current page
    const tablesInPage = OCRResponse.analyzeResult?.tables?.filter((table) =>
      table.boundingRegions?.some((region) => region.pageNumber === page.pageNumber)
    ) ?? [];
    const out: Page = {
      page_num: page.pageNumber,
      components: await mapTablesToOCRComponents11(customSchema)(OCRResponse, tablesInPage),
    };

    return out;
  })
  );
  return smth
}

/**
 * @param OCRResponse
 * @returns
 */
const mapTablesToOCRComponents11 =
  (customSchema: Schema) =>
  async (OCRResponse: AnalyzeOperationOutput, tablesInPage: DocumentTableOutput[]): Promise<OCRComponent[]> => {
    const model = initialiseModel(customSchema)

    const result = await model.generateContent(createPrompt11(OCRResponse, tablesInPage));
    const rawText = result.response.text() ?? '{}';
    const parsed = JSON.parse(rawText) as { components: OCRComponent[] };

    const transformedComponents: OCRComponent[] = parsed.components.map((comp) => ({
      ...comp,
      // Apply the transformer to the boundingBoxes array
      boundingBoxes: comp.boundingBoxes ? toColumnDict(comp.boundingBoxes) : {},
    }));
    return transformedComponents;
  };
/**
 * @param OCRResponse
 * @returns
 */
const mapTablesToOCRComponents =
  (customSchema: Schema) =>
  async (OCRResponse: AnalyzeOperationOutput): Promise<OCRComponent[]> => {
    const model = initialiseModel(customSchema)

    const result = await model.generateContent(createPrompt(OCRResponse));
    const rawText = result.response.text() ?? '{}';
    const parsed = JSON.parse(rawText) as { components: OCRComponent[] };

    const transformedComponents: OCRComponent[] = parsed.components.map((comp) => ({
      ...comp,
      // Apply the transformer to the boundingBoxes array
      boundingBoxes: comp.boundingBoxes ? toColumnDict(comp.boundingBoxes) : {},
    }));
    return transformedComponents;
  };

const client: DocumentIntelligenceClient = DocumentIntelligence(
  endpoint,
  { key: key },
  { apiVersion: '2024-11-30' }
);



export async function analyse_result(buffer: Buffer) {
  const request = await client.path('/documentModels/{modelId}:analyze', 'prebuilt-layout').post({
    contentType: 'application/octet-stream',
    body: buffer,
  });

  if (isUnexpected(request)) {
    throw request.body.error;
  }

  const poller = getLongRunningPoller(client, request);
  const response = await poller.pollUntilDone();

  const result = response.body as AnalyzeOperationOutput;
  const defaultOutputFunc = await mapTablesToOCRComponents(geminiSchemaBBoxPrompt);
  const processedOut = await defaultOutputFunc(result);
  fs.writeFileSync('smthToWorkWithPotentially.json', JSON.stringify(processedOut, null, 2));
  return processedOut;
}
