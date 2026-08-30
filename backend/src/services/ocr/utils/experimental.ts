import {
  //type DocumentFieldOutput,
  type DocumentPageOutput,
  //type DocumentTableCellKindOutput,
  //type DocumentTableCellOutput,
  type DocumentTableOutput,
  //type DocumentWordOutput,
} from '@azure-rest/ai-document-intelligence';
import {
  //type DocumentIntelligenceClient,
  type AnalyzeOperationOutput,
} from '@azure-rest/ai-document-intelligence';
import { GoogleGenerativeAI, Schema } from '@google/generative-ai';
import {
  OCRComponent,
  OCRBoundingBoxes,
  //Vertex,
  //geminiSchemaBBoxPrompt,
  OCRColumnBoundingBoxes,
  Pages,
  Page,
} from '../types/boundingBoxTypes';

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// const endpoint = process.env.endpoint!;
// const key = process.env.AZURE_CLOUD_API_KEY!;

// function pruneOCROutput(OCRResponse: AnalyzeOperationOutput, tablesInPage: DocumentTableOutput[]): any {
//   const result = OCRResponse.analyzeResult;
//   if (!result) return {};

//   const allWords = result.pages?.flatMap((page) => page.words ?? []) ?? [];

//   const wordsInSpan = (span?: { offset: number; length: number }) => {
//     if (!span) return [];
//     return allWords
//       .filter(
//         (w) =>
//           w.span.offset >= span.offset && w.span.offset + w.span.length <= span.offset + span.length
//       )
//       .map((w) => ({ content: w.content, confidence: w.confidence, polygon: w.polygon }));
//   };

//   return {
//     content: result.content, // Raw text content
//     tables: tablesInPage.map((table) => ({
//       rowCount: table.rowCount,
//       columnCount: table.columnCount,
//       cells: table.cells.map((cell) => ({
//         rowIndex: cell.rowIndex,
//         columnIndex: cell.columnIndex,
//         content: cell.content,
//         kind: cell.kind,
//         boundingRegions: cell.boundingRegions,
//         // NEW: word-level polygons for the text inside this cell —
//         // use these (not boundingRegions above) to judge real indentation.
//         words: wordsInSpan(cell.spans?.[0]),
//       })),
//     })),
//     pages: result.pages?.map((page) => ({
//       pageNumber: page.pageNumber,
//       words: page.words?.map((word) => ({
//         content: word.content,
//         confidence: word.confidence,
//         polygon: word.polygon,
//         span: word.span,
//       })),
//     })),
//   };
// }

function pruneOCROutput(
  OCRResponse: AnalyzeOperationOutput,
  tablesInPage: DocumentTableOutput[],
  currentPage: DocumentPageOutput
): any {
  const result = OCRResponse.analyzeResult;
  if (!result) return {};

  // Only this page's words
  const pageWords = currentPage.words ?? [];

  const wordsInSpan = (span?: { offset: number; length: number }) => {
    if (!span) return [];
    return pageWords
      .filter(
        (w) =>
          w.span.offset >= span.offset && w.span.offset + w.span.length <= span.offset + span.length
      )
      .map((w) => ({ content: w.content, confidence: w.confidence, polygon: w.polygon }));
  };

  return {
    content: pageWords.map((w) => w.content).join(' '), // scoped to this page, not the whole doc
    tables: tablesInPage.map((table) => ({
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      cells: table.cells.map((cell) => ({
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        content: cell.content,
        kind: cell.kind,
        boundingRegions: cell.boundingRegions,
        words: wordsInSpan(cell.spans?.[0]),
      })),
    })),
    pages: [
      {
        pageNumber: currentPage.pageNumber,
        words: pageWords.map((word) => ({
          content: word.content,
          confidence: word.confidence,
          polygon: word.polygon,
          span: word.span,
        })),
      },
    ],
  };
}

function toColumnDict(boxes: OCRBoundingBoxes | any[]): OCRColumnBoundingBoxes {
  if (!boxes) return {};

  if (Array.isArray(boxes)) {
    return Object.fromEntries(
      boxes.map((b) => [
        b.columnKey,
        { text: b.text, column: b.column, vertices: b.vertices, confidence: b.confidence },
      ])
    );
  }

  return Object.fromEntries(
    Object.entries(boxes).map(([key, value]) => [
      key,
      {
        text: value.text,
        column: value.column ?? key,
        vertices: value.vertices,
        confidence: value.confidence,
      },
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
};

const createPrompt = (
  OCRResponse: AnalyzeOperationOutput,
  tablesInPage: DocumentTableOutput[],
  currentPage: DocumentPageOutput
) => {
  return `Analyze the following Azure Document Intelligence layout output and convert it into structured components.
               
               Mapping Guidelines:
               - Map section headings/titles to 'TITLE' or 'HEADER'.
               - Map table rows/cells to 'TABLE_ROW' or 'TABLE_COLS' and populate the 'cells' string array.
               - Make sure that there is atleast one 'TABLE_COLS' to define the table's columns
               - CRITICAL: 'cells' must always be a DENSE array — exactly one entry per column in the table, in column order, for every 'TABLE_ROW' and 'TABLE_COLS'. If a row does not populate a given column, put an empty string "" in that position. NEVER omit an entry for an empty column and NEVER shift later values left to fill the gap — position i in 'cells' must always correspond to column i, even when it's blank.
               - Map standard paragraphs to 'BODY_TEXT'.
               - Calculate visual 'y' coordinates and 'indentation' based on the bounding region points.
               - IMPORTANT: a cell's own boundingRegions box is coarse and does NOT shrink when its text is nested/indented — Azure draws the same cell-sized box either way. To determine true indentation, use each cell's "words" array instead and take the leftmost x-coordinate of the word polygons. Compare that leftmost x across rows in the same table to decide nesting.
               - if TABLE_ROW, determine layer by checking indentation (via word polygons, not cell boxes), if layer > 1, find and assign parent row id (the nearest preceding row with smaller indentation).
               - Store bounding boxes per table column, keyed like "col_0", "col_1", etc. Include an entry for EVERY column, in the same order and count as 'cells' — even columns with no text should get an entry (empty "text", but still the correct "column" label and a vertices box). Each entry has the column's text, a "column" label (e.g. "Column 0"), its vertices, and confidence.

${JSON.stringify(pruneOCROutput(OCRResponse, tablesInPage, currentPage))}`;
};

//Seemingly unused func
// function logTablePages(result: AnalyzeOperationOutput) {
//   result.analyzeResult!.tables?.forEach((table, index) => {
//     // Collect all unique 1-based page numbers the table covers
//     const pageNumbers = table.boundingRegions?.map((region) => region.pageNumber) || [];

//     console.log(`Table #${index} spans across page(s): ${pageNumbers.join(', ')}`);
//   });
// }

export const mapOCRtoPages =
  (customSchema: Schema) =>
  async (OCRResponse: AnalyzeOperationOutput): Promise<Pages> => {
    const smth = await Promise.all(
      (OCRResponse.analyzeResult?.pages ?? []).map(async (page) => {
        const tablesInPage =
          OCRResponse.analyzeResult?.tables?.filter((table) =>
            table.boundingRegions?.some((region) => region.pageNumber === page.pageNumber)
          ) ?? [];
        const out: Page = {
          page_num: page.pageNumber,
          components: await mapTablesToOCRComponents(customSchema)(OCRResponse, tablesInPage, page), // <-- pass page
        };
        return out;
      })
    );
    return smth;
  };

/**
 * @param OCRResponse
 * @returns
 */
const mapTablesToOCRComponents =
  (customSchema: Schema) =>
  async (
    OCRResponse: AnalyzeOperationOutput,
    tablesInPage: DocumentTableOutput[],
    currentPage: DocumentPageOutput // <-- add this param
  ): Promise<OCRComponent[]> => {
    const model = initialiseModel(customSchema);

    const result = await model.generateContent(
      createPrompt(OCRResponse, tablesInPage, currentPage)
    );
    const rawText = result.response.text() ?? '{}';
    const parsed = JSON.parse(rawText) as { components: OCRComponent[] };

    const transformedComponents: OCRComponent[] = parsed.components.map((comp) => ({
      ...comp,
      boundingBoxes: comp.boundingBoxes ? toColumnDict(comp.boundingBoxes) : {},
    }));
    return transformedComponents;
  };
