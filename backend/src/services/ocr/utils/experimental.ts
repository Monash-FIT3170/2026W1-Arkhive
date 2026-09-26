import {
  AnalyzeResultOutput,
  DocumentLineOutput,
  DocumentTableCellOutput,
  type DocumentPageOutput,
  type DocumentTableOutput,
} from '@azure-rest/ai-document-intelligence';
import {
  type AnalyzeOperationOutput,
} from '@azure-rest/ai-document-intelligence';
import { GoogleGenAI, Schema, ThinkingLevel } from '@google/genai';
import {
  OCRComponent,
  OCRBoundingBoxes,
  //Vertex,
  //geminiSchemaBBoxPrompt,
  OCRColumnBoundingBoxes,
  Pages,
  Page,
  OCRBoundingBox,
} from '../types/boundingBoxTypes';
import { OpenRedaction } from "openredaction";
import fs from "fs"

const redactor = new OpenRedaction();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

async function redactSensitiveInformation(OCRString: string){
  return await redactor.detect(
    OCRString
  )
}


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
      .map(async (w) => ({ content: await redactSensitiveInformation(w.content), confidence: w.confidence, polygon: w.polygon }));
  };

  return {
    content: OCRResponse.analyzeResult?.content!, // scoped to this page, not the whole doc
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

/**
 *AI Declaration: I used Gemini to create this function
 *
 * @param {OCRComponent[]} ocrComponent
 * @param {AnalyzeResultOutput} azureOutput
 * @param {AnalyzeOperationOutput} OCRResponse
 * @return {*}  {OCRComponent[]}
 * 
 * @author Harsha Sharma 33879303
 */
function hydrateOutput(
  ocrComponent: OCRComponent[],
  azureOutput: AnalyzeResultOutput
): OCRComponent[] {
  // 1. Flatten all Azure table cells into a clean lookup array with raw vertices
  const azureCells = (azureOutput.tables || []).flatMap((table) =>
    (table.cells || []).map((cell) => {
      const polygon = cell.boundingRegions?.[0]?.polygon || [];
      const vertices: { x: number; y: number }[] = [];

      // Extract raw 4-corner polygon points directly without scale math
      for (let i = 0; i < polygon.length; i += 2) {
        vertices.push({
          x: Math.round(polygon[i]),
          y: Math.round(polygon[i + 1]),
        });
      }

      // Safely derive confidence score
      const cellWords = (cell as any).words;
      let confidence = 0.99;
      if (Array.isArray(cellWords) && cellWords.length > 0) {
        const total = cellWords.reduce(
          (sum: number, w: any) => sum + (w.confidence ?? 1),
          0
        );
        confidence = Number((total / cellWords.length).toFixed(2));
      }

      return {
        text: cell.content?.trim() || "",
        rowIndex: cell.rowIndex,
        columnIndex: cell.columnIndex,
        vertices,
        confidence,
        cell,
      };
    })
  );

  // 2. Hydrate components via direct array index lookup
  return ocrComponent.map((component) => {
    // Skip hydration if component lacks cells or isn't a table component
    if (!component.cells || !Array.isArray(component.cells) || component.cells.length === 0) {
      return component;
    }

    const boundingBoxes: OCRBoundingBoxes = component.cells.reduce<OCRBoundingBoxes>(
      (acc, cellText, colIndex) => {
        const cleanText = cellText?.trim() || "";
        const columnKey = `col_${colIndex}`;

        // Primary Lookup: Match by column index AND text equality/substring
        let matchedCell = azureCells.find(
          (ac) =>
            ac.columnIndex === colIndex &&
            (ac.text === cleanText || ac.text.includes(cleanText) || cleanText.includes(ac.text)) 
            && component.y <= ac.vertices[0].y 
        );

        // Fallback Lookup: Match strictly by column index position if text differs slightly
        if (!matchedCell) {
          matchedCell = azureCells.find((ac) => ac.columnIndex === colIndex);
        }

        acc[columnKey] = {
          text: cellText,
          column: `Column ${colIndex}`,
          vertices: matchedCell?.vertices || [],
          confidence: matchedCell?.confidence ?? 0.99,
        };

        return acc;
      },
      {}
    );

    return {
      ...component,
      boundingBoxes,
    };
  });
}


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
    const prunedOCR = pruneOCROutput(OCRResponse, tablesInPage, currentPage)
    const result = await ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: [
          JSON.stringify(prunedOCR),
      ],
     
      config: {
         systemInstruction: `Analyze the following Azure Document Intelligence layout output and convert it into structured components.
               
               Mapping Guidelines:
               - Map section headings/titles to 'TITLE' or 'HEADER'.
               - Map table rows/cells to 'TABLE_ROW' or 'TABLE_COLS' and populate the 'cells' string array.
               - Make sure that there is atleast one 'TABLE_COLS' to define the table's columns
               - CRITICAL: 'cells' must always be a DENSE array — exactly one entry per column in the table, in column order, for every 'TABLE_ROW' and 'TABLE_COLS'. If a row does not populate a given column, put an empty string "" in that position. NEVER omit an entry for an empty column and NEVER shift later values left to fill the gap — position i in 'cells' must always correspond to column i, even when it's blank.
               - Map standard paragraphs to 'BODY_TEXT'.
               - Calculate visual 'y' coordinates and 'indentation' based on the bounding region points.
               - IMPORTANT: a cell's own boundingRegions box is coarse and does NOT shrink when its text is nested/indented — Azure draws the same cell-sized box either way. To determine true indentation, use each cell's "words" array instead and take the leftmost x-coordinate of the word polygons. Compare that leftmost x across rows in the same table to decide nesting.
               - if TABLE_ROW, determine layer by checking indentation (via word polygons, not cell boxes), if layer > 1, find and assign parent row id (the nearest preceding row with smaller indentation).`,
        responseMimeType: "application/json",
        responseSchema: customSchema,
      },
    });

    const rawText = result.text ?? '{}';
    const parsed = JSON.parse(rawText) as { components: OCRComponent[] };
    const transformedComponents: OCRComponent[] = parsed.components.map((comp) => ({
      ...comp,
      boundingBoxes: comp.boundingBoxes ? toColumnDict(comp.boundingBoxes) : {},
    }));
    const hydratedData = hydrateOutput(transformedComponents, prunedOCR)
    fs.writeFileSync("primeHydrati1on.txt", JSON.stringify(hydratedData, null, 2))

    return hydratedData;
  };
