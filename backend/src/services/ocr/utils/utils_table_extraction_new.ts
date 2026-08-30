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
} from '../types/boundingBoxTypes';
import { mapOCRtoPages } from './experimental';

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const endpoint = process.env.endpoint!;
const key = process.env.AZURE_CLOUD_API_KEY!;

/**
 * Prune Azure's raw response down to what we need for the LLM pass.
 * FIX: pages/words now sit at the top level (sibling of tables), not nested
 * inside each table — previously every table object got its own copy of
 * every page's words, which needlessly bloated the prompt.
 *
 * Each cell also now carries its own boundingRegions AND the words whose
 * span falls inside that cell. The cell's own box is coarse and constant
 * regardless of nesting, but the word polygons show where the text actually
 * starts — that's what the LLM needs to detect indentation/nesting.
 *
 * @param {AnalyzeOperationOutput} OCRResponse
 * @return {*}
 * @author Harsha Sharma 33879303
 */
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

function toColumnDict(boxes: any[]): OCRColumnBoundingBoxes {
  return Object.fromEntries(
    boxes.map((b) => [
      b.columnKey,
      { text: b.text, column: b.column, vertices: b.vertices, confidence: b.confidence },
    ])
  );
}

function logTablePages(result: AnalyzeOperationOutput) {
  result.analyzeResult!.tables?.forEach((table, index) => {
    // Collect all unique 1-based page numbers the table covers
    const pageNumbers = table.boundingRegions?.map((region) => region.pageNumber) || [];

    console.log(`Table #${index} spans across page(s): ${pageNumbers.join(', ')}`);
  });
}

/**
 * @param OCRResponse
 * @returns
 */
const mapTablesToOCRComponents =
  (customSchema: Schema) =>
  async (OCRResponse: AnalyzeOperationOutput): Promise<OCRComponent[]> => {
    OCRResponse.analyzeResult?.pages.map((page) => {});
    OCRResponse.analyzeResult!.tables!.filter((table) => {
      table.boundingRegions?.filter((region) => region.pageNumber == 1);
    });
    const model = ai.getGenerativeModel({
      model: 'gemini-3.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: customSchema,
      },
    });

    const prompt = `Analyze the following Azure Document Intelligence layout output and convert it into structured components.
               
               Mapping Guidelines:
               - Map section headings/titles to 'TITLE' or 'HEADER'.
               - Map table rows/cells to 'TABLE_ROW' or 'TABLE_COLS' and populate the 'cells' string array.
               - Map standard paragraphs to 'BODY_TEXT'.
               - Calculate visual 'y' coordinates and 'indentation' based on the bounding region points.
               - IMPORTANT: a cell's own boundingRegions box is coarse and does NOT shrink when its text is nested/indented — Azure draws the same cell-sized box either way. To determine true indentation, use each cell's "words" array instead and take the leftmost x-coordinate of the word polygons. Compare that leftmost x across rows in the same table to decide nesting.
               - if TABLE_ROW, determine layer by checking indentation (via word polygons, not cell boxes), if layer > 1, find and assign parent row id (the nearest preceding row with smaller indentation).
               - Store bounding boxes per table column, keyed like "col_0", "col_1", etc. (one entry per column present in that row), each with the column's text, a "column" label (e.g. "Column 0"), its vertices, and confidence.

${JSON.stringify(pruneOCROutput(OCRResponse))}`;

    const result = await model.generateContent(prompt);
    const rawText = result.response.text() ?? '{}';
    const parsed = JSON.parse(rawText) as { components: OCRComponent[] };

    const transformedComponents: OCRComponent[] = parsed.components.map((comp) => ({
      ...comp,
      // Apply the transformer to the boundingBoxes array
      boundingBoxes: comp.boundingBoxes && Array.isArray(comp.boundingBoxes) ? toColumnDict(comp.boundingBoxes) : {},
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
  const tester = await mapOCRtoPages(geminiSchemaBBoxPrompt);
  const defaultOutputFunc = await mapTablesToOCRComponents(geminiSchemaBBoxPrompt);
  //const processedOut = await defaultOutputFunc(result);
  const output = await tester(result);
  fs.writeFileSync('smthToWorkWithPotentially.json', JSON.stringify(output, null, 2));
  return output;
}
