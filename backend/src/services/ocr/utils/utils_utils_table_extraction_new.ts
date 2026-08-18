import DocumentIntelligence, { type DocumentTableCellOutput, type DocumentTableOutput, type DocumentWordOutput } from "@azure-rest/ai-document-intelligence";
import { getLongRunningPoller, isUnexpected, type DocumentIntelligenceClient, type AnalyzeOperationOutput } from "@azure-rest/ai-document-intelligence";
import fs from "fs"
import { OCRComponent, Vertex } from "../types/boundingBoxTypes";
import { OCRBoundingBoxes } from "./utils_table_extraction_new";

const endpoint = "https://jonmeraqsadilam.cognitiveservices.azure.com";
const key = "no key";

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

export const mapTablesToOCRComponents = (
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
        tableBaseX = Math.min(tableBaseX, polygon[0]);
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
    // levelParents[0] = top-level parent ID, levelParents[1] = level 1 parent ID, etc.
    const levelParents: Map<number, string> = new Map();
    const tableParentId = `table_${tableIdx}`;

    // 3. Process each row sequentially
    const sortedRowIndexes = Array.from(rowsMap.keys()).sort((a, b) => a - b);

    sortedRowIndexes.forEach((rowIndex) => {
      const cellsInRow = rowsMap.get(rowIndex)!;
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
            vertices.push({ x: polygon[i], y: polygon[i + 1] });
          }
          minRowY = Math.min(minRowY, polygon[1], polygon[3]);
          minRowX = Math.min(minRowX, polygon[0], polygon[6]);
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
      const INDENT_STEP_THRESHOLD = 0.15; // Adjustment step threshold
      const indentLevel = Math.max(0, Math.round(relativeOffset / INDENT_STEP_THRESHOLD));

      const currentRowId = `${tableParentId}_row_${rowIndex}`;

      // 5. Determine Parent ID based on Indent Level
      let parentId: string;
      if (indentLevel === 0) {
        // Base level items belong directly to the table
        parentId = tableParentId;
      } else {
        // Sub-items look up the parent registered at (indentLevel - 1)
        parentId = levelParents.get(indentLevel - 1) ?? tableParentId;
      }

      // Register this row as the potential parent for any deeper child rows coming after it
      levelParents.set(indentLevel, currentRowId);

      components.push({
        id: currentRowId,
        type: isHeaderRow ? "HEADER" : "TABLE_ROW",
        indentation: indentLevel,
        y: minRowY === Infinity ? 0 : minRowY,
        layer: indentLevel + 1,
        parentId: parentId,
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

export async function analyse_image(fileBuffer: Buffer) {
  const request = await client.path("/documentModels/{modelId}:analyze", "prebuilt-layout").post({
    contentType: "application/pdf",
    body: fileBuffer
  });

  if (isUnexpected(request)){
    throw request.body.error;
  }

  const poller = getLongRunningPoller(client, request);
  const response = await poller.pollUntilDone();

  const result = response.body as AnalyzeOperationOutput;

  //console.log(JSON.stringify(tables, null, 2));
  return mapTablesToOCRComponents(result)
}


await analyse_image(fs.readFileSync("C:/Users/harsh/Downloads/sample-file (3).pdf"))