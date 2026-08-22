import DocumentIntelligence, { type DocumentFieldOutput, type DocumentPageOutput, type DocumentTableCellKindOutput, type DocumentTableCellOutput, type DocumentTableOutput, type DocumentWordOutput } from "@azure-rest/ai-document-intelligence";
import { getLongRunningPoller, isUnexpected, type DocumentIntelligenceClient, type AnalyzeOperationOutput } from "@azure-rest/ai-document-intelligence";
import fs from "fs"
import { GoogleGenAI } from "@google/genai";
import { OCRComponent, OCRBoundingBoxes, Vertex } from "../types/boundingBoxTypes";

const ai = new GoogleGenAI({
  apiKey: "nope"
});

const endpoint = "https://jonmeraqsadilam.cognitiveservices.azure.com";
const key = "nope";

export function getWordsInCell(
  cell: DocumentTableCellOutput,
  pageWords: DocumentWordOutput[]
): DocumentWordOutput[] {
  if (!cell.spans || cell.spans.length === 0 || !pageWords.length) {
    return [];
  }

  const cellOffset = cell.spans[0]?.offset ?? 0;
  const cellLength = cell.spans[0]?.length ?? 0;
  const cellEnd = cellOffset + cellLength;

  // Binary search to find the index of the first word whose offset >= cellOffset
  let low = 0;
  let high = pageWords.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    const wordOffset = pageWords[mid]?.span?.offset ?? Infinity;
    if (wordOffset < cellOffset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const cellWords: DocumentWordOutput[] = [];

  // Collect words whose START position falls inside [cellOffset, cellEnd)
  for (let i = low; i < pageWords.length; i++) {
    const word = pageWords[i];
    if (!word || !word.span) continue;

    // Stop if the word starts AT or AFTER the cell's end boundary
    if (word.span.offset >= cellEnd) {
      break;
    }

    cellWords.push(word);
  }

  return cellWords;
}


function pruneOCROutput(OCRResponse: AnalyzeOperationOutput){
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


export const mapTablesToOCRComponents = async (
  OCRResponse: AnalyzeOperationOutput
): Promise<any> => {
  const schema = {
  "type": "OBJECT",
  "properties": {
    "components": {
      "type": "ARRAY",
      "description": "List of OCR layout components extracted from the document",
      "items": {
        "type": "OBJECT",
        "properties": {
          "id": {
            "type": "STRING"
          },
          "type": {
            "type": "STRING",
            "enum": [
              "TITLE",
              "HEADER",
              "TABLE_ROW",
              "BODY_TEXT",
              "TABLE_COLS"
            ]
          },
          "indentation": {
            "type": "NUMBER"
          },
          "y": {
            "type": "NUMBER"
          },
          "layer": {
            "type": "INTEGER"
          },
          "parentId": {
            "type": "STRING"
          },
          "text": {
            "type": "STRING"
          },
          "cells": {
            "type": "ARRAY",
            "items": {
              "type": "STRING"
            }
          },
          "confidence": {
            "type": "NUMBER"
          },
          "boundingBoxes": {
            "type": "ARRAY",
            "description": "Array representation of the bounding boxes record for compatibility",
            "items": {
              "type": "OBJECT",
              "properties": {
                "key": {
                  "type": "STRING"
                },
                "box": {
                  "type": "OBJECT",
                  "properties": {
                    "text": {
                      "type": "STRING"
                    },
                    "column": {
                      "type": "STRING"
                    },
                    "confidence": {
                      "type": "NUMBER"
                    },
                    "vertices": {
                      "type": "ARRAY",
                      "items": {
                        "type": "OBJECT",
                        "properties": {
                          "x": {
                            "type": "NUMBER"
                          },
                          "y": {
                            "type": "NUMBER"
                          }
                        },
                        "required": ["x", "y"]
                      }
                    }
                  },
                  "required": ["text", "vertices", "confidence"]
                }
              },
              "required": ["key", "box"]
            }
          }
        },
        "required": [
          "id",
          "type",
          "indentation",
          "y",
          "boundingBoxes",
          "layer",
          "text",
          "confidence"
        ]
      }
    }
  }
}
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
      schema: schema
    }
  })
  const rawText = structuredOutput.output_text ?? "{}"
  const parsed = JSON.parse(rawText) as { components: OCRComponent[] };
  return parsed.components;
}

export const mapTablesToOCRComponents1 = (
  OCRResponse: AnalyzeOperationOutput
): OCRComponent[] => {
  const analyzeResult = OCRResponse.analyzeResult;
  if (!analyzeResult?.tables) return [];

  const components: OCRComponent[] = [];

  analyzeResult.tables.forEach((table: DocumentTableOutput, tableIdx: number) => {
    // 1. Determine Table Base Left Margin
    let tableBaseX = Infinity;
    table.cells.forEach((cell) => {
      const polygon = cell.boundingRegions?.[0]?.polygon;
      if (polygon && polygon.length >= 2) {
        tableBaseX = Math.min(tableBaseX, polygon[0]!);
      }
    });
    if (tableBaseX === Infinity) tableBaseX = 0;

    // 2. Group cells by row index
    const rowsMap = new Map<number, DocumentTableCellOutput[]>();
    table.cells.forEach((cell) => {
      const row = rowsMap.get(cell.rowIndex) ?? [];
      row.push(cell);
      rowsMap.set(cell.rowIndex, row);
    });

    // Track the active parent ID at each indentation level
    const tableParentId = `table_${tableIdx}`;

    // 3. Process each row sequentially
    const sortedRowIndexes = Array.from(rowsMap.keys()).sort((a, b) => a - b);

    sortedRowIndexes.forEach((rowIndex) => {
      const cellsInRow = rowsMap.get(rowIndex)!;
      fs.writeFileSync(`cellsinrow${rowIndex}.json`, JSON.stringify(cellsInRow, null, 2))
      cellsInRow.sort((a, b) => a.columnIndex - b.columnIndex);

      const isHeaderRow = cellsInRow.some((c) => c.kind === "columnHeader");

      const rowCellTexts: string[] = [];
      const rowBoundingBoxes: OCRBoundingBoxes = {};
      let totalConfidenceSum = 0;
      let totalWordCount = 0;
      let minRowY = Infinity;
      let minRowX = Infinity;

      cellsInRow.forEach((cell) => {
        rowCellTexts.push(cell.content ?? "");

        const pageNum = cell.boundingRegions?.[0]?.pageNumber ?? 1;
        const targetPage = analyzeResult.pages?.find((p) => p.pageNumber === pageNum);
        const pageWords = targetPage?.words ?? [];

        const cellWords = getWordsInCell(cell, pageWords);
        const cellConfidence =
          cellWords.length > 0
            ? cellWords.reduce((sum, w) => sum + (w.confidence ?? 1), 0) / cellWords.length
            : 1;

        totalConfidenceSum += cellConfidence;
        totalWordCount += 1;

        const polygon = cell.boundingRegions?.[0]?.polygon ?? [];
        const vertices: Vertex[] = [];

        if (polygon.length >= 8) {
          for (let i = 0; i < polygon.length; i += 2) {
            vertices.push({ x: polygon[i]!, y: polygon[i + 1]! });
          }
          minRowY = Math.min(minRowY, polygon[1]!, polygon[3]!);
          minRowX = Math.min(minRowX, polygon[0]!, polygon[6]!);
        }

        const boxKey = `col_${cell.columnIndex}`;
        rowBoundingBoxes[boxKey] = {
          text: cell.content ?? "",
          column: `Column ${cell.columnIndex}`,
          vertices,
          confidence: cellConfidence,
        };
      });

      // 4. Calculate Indentation Level
      const relativeOffset = minRowX !== Infinity ? minRowX - tableBaseX : 0;
      console.log(`the relative offset is ${relativeOffset} ${tableBaseX} ${minRowX}`)
      const INDENT_STEP_THRESHOLD = 0.4292; // Adjustment step threshold
      const indentLevel = Math.max(0, Math.round(relativeOffset / INDENT_STEP_THRESHOLD));

      const currentRowId = `${tableParentId}_row_${rowIndex}`;
      const currentRowY = cellsInRow?.[0]?.boundingRegions?.[0]?.polygon?.[1];

            // 5. Determine Parent ID based on Indent Level
      let parentId: string = tableParentId;

      if (indentLevel > 0) {
        // Look backward through already processed components to find the closest valid parent
        for (let i = components.length - 1; i >= 0; i--) {
          if (components[i]!.indentation == indentLevel - 1) {
            parentId = components[i]!.id;
            break;
          }
        }
      }

      // 6. Push to components (This replaces your registration map entirely)
      components.push({
        id: currentRowId,
        type: isHeaderRow ? "HEADER" : "TABLE_ROW",
        indentation: indentLevel,
        y: minRowY === Infinity ? 0 : minRowY,
        layer: indentLevel + 1,
        parentId, // Safely assigned above
        text: rowCellTexts.join(" | "),
        cells: rowCellTexts,
        confidence: totalWordCount > 0 ? totalConfidenceSum / totalWordCount : 1,
        boundingBoxes: rowBoundingBoxes,
      });
    });
  });

  return components;
};

const client: DocumentIntelligenceClient = DocumentIntelligence(endpoint, {key: key}, { apiVersion: "2024-11-30" })
export async function analyse() {
  const request = await client.path("/documentModels/{modelId}:analyze", "prebuilt-layout").post({
    contentType: "application/pdf",
    body: fs.createReadStream("C:/Users/harsh/OneDrive/Pictures/sample-file-1.pdf")
  });

  if (isUnexpected(request)){
    throw request.body.error;
  }

  const poller = getLongRunningPoller(client, request);
  const response = await poller.pollUntilDone();

  const result = response.body as AnalyzeOperationOutput;

  const tables = result.analyzeResult?.pages?.[0]?.words?.[0]?.confidence ?? 0;
  //console.log(JSON.stringify(tables, null, 2));
  fs.writeFileSync("smthToWorkWithPotentially.json", JSON.stringify(await mapTablesToOCRComponents(result), null, 2))
  //return mapTablesToOCRComponents(result)
}

await analyse();