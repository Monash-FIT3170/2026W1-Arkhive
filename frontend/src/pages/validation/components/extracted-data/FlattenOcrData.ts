import type { ExtractedData, ExtractedRow } from "../../../../models/TableData";
import type { OCRComponent } from "../../../../models/OCRComponent";

export function normalizeColKey(col: string): string {
  return col
    .replace(/\(.*?\)/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, "_")
    .trim()
    .toUpperCase();
}

/** Finds the horizontal center (X coordinate) of a specific cell in a component */
export function cellMidX(component: OCRComponent, key: string): number | null {
  const verts = component.boundingBoxes?.[key]?.vertices;
  if (!verts?.length) return null;

  const xs = verts.map((v) => Number(v.x));
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/** Helper to find the index of the closest number */
function findClosestIndex(
  target: number,
  values: number[],
  startIndex = 0
): number {
  let bestIdx = startIndex;
  let minScore = Infinity;

  for (let j = startIndex; j < values.length; j++) {
    const score = Math.abs(target - values[j]);
    if (score < minScore) {
      minScore = score;
      bestIdx = j;
    }
  }
  return bestIdx;
}

/** Extract column headers + positions */
export function extractColumns(data: OCRComponent[]) {
  const colComp = data.find((c) => c.type === "TABLE_COLS");
  const rawCols = colComp?.cells ?? [];

  const keys = rawCols.map(normalizeColKey);
  const positions = rawCols.map(
    (_, i) => (colComp ? cellMidX(colComp, `cell_${i}`) : null) ?? i * 100
  );

  return { keys, positions };
}

/** Detect main item column */
export function detectItemColumn(
  components: OCRComponent[],
  colXs: number[]
): number {
  const freq = new Map<number, number>();

  components.forEach((c) => {
    const startX = cellMidX(c, "cell_0");
    if (startX === null) return;

    const closestColIdx = findClosestIndex(startX, colXs);
    freq.set(closestColIdx, (freq.get(closestColIdx) ?? 0) + 1);
  });

  if (freq.size === 0) return 0;

  return [...freq.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/** Resolve nesting levels */
export function resolveLevels(components: OCRComponent[]) {
  const idToDepth = new Map<string, number>();
  const stack: { id: string; indent: number; depth: number }[] = [];
  const INDENT_THRESHOLD = 6;

  for (const c of components) {
    const verts = c.boundingBoxes?.["cell_0"]?.vertices;
    const currentIndent = verts?.length
      ? (Math.min(...verts.map((v) => Number(v.x))) + (c.indentation ?? 0)) / 2
      : (c.indentation ?? 0);

    let currentDepth = 0;

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const diff = currentIndent - top.indent;

      if (diff > INDENT_THRESHOLD) {
        currentDepth = top.depth + 1;
        break;
      } else if (Math.abs(diff) <= INDENT_THRESHOLD) {
        currentDepth = top.depth;
        stack.pop();
        break;
      } else {
        stack.pop();
      }
    }

    stack.push({ id: c.id, indent: currentIndent, depth: currentDepth });
    idToDepth.set(c.id, currentDepth);
  }

  return idToDepth;
}

/** Resolve cell column index */
function resolveCellColIdx(
  component: OCRComponent,
  cellIndex: number,
  colKeys: string[],
  colXs: number[],
  lastColIdx: number
): number {
  const bbKey = `cell_${cellIndex}`;
  const rawColumnName = component.boundingBoxes?.[bbKey]?.column;

  if (rawColumnName) {
    const idx = colKeys.indexOf(normalizeColKey(rawColumnName));
    if (idx !== -1) return idx;
  }

  const mX = cellMidX(component, bbKey) ?? 0;
  const safeStartIndex = Math.min(lastColIdx + 1, colXs.length - 1);

  return findClosestIndex(mX, colXs, safeStartIndex);
}

type BuildRowsParams = {
  components: OCRComponent[];
  colKeys: string[];
  colXs: number[];
  itemCol: number;
  idToDepth: Map<string, number>;
};

export function buildRows({
  components,
  colKeys,
  colXs,
  itemCol,
  idToDepth
}: BuildRowsParams): { rows: ExtractedRow[]; levelCols: string[] } {
  const maxDepth = Math.max(...idToDepth.values(), 0);

  const subItemCols = Array.from(
    { length: maxDepth },
    (_, i) => `SUB_${colKeys[itemCol]}_${i + 1}`
  );

  const rows: ExtractedRow[] = [];
  const cascadingLeftValues: Record<string, string[]> = {};
  const hierarchyValues: string[] = [];

  for (let i = 0; i < itemCol; i++) {
    cascadingLeftValues[colKeys[i]] = [];
  }

  components.forEach((c) => {
    const depth = idToDepth.get(c.id) ?? 0;
    let lastColIdx = -1;

    const mappedCells = (c.cells ?? []).map((val, i) => {
      const colIdx = resolveCellColIdx(c, i, colKeys, colXs, lastColIdx);
      lastColIdx = colIdx;
      return { val, colIdx };
    });

    for (let i = 0; i < itemCol; i++) {
      const colKey = colKeys[i];
      const cellValue = mappedCells.find((mc) => mc.colIdx === i)?.val;

      if (cellValue) {
        cascadingLeftValues[colKey][depth] = cellValue;
      } else if (depth > 0) {
        cascadingLeftValues[colKey][depth] =
          cascadingLeftValues[colKey][depth - 1] ?? "";
      } else {
        cascadingLeftValues[colKey][depth] = "";
      }
      cascadingLeftValues[colKey].length = depth + 1;
    }

    const itemValue =
      mappedCells.find((mc) => mc.colIdx === itemCol)?.val ?? "";

    hierarchyValues[depth] = itemValue;
    hierarchyValues.length = depth + 1;

    const row: ExtractedRow = { _id: c.id };
    [...colKeys, ...subItemCols].forEach((col) => (row[col] = ""));

    mappedCells.forEach(({ val, colIdx }) => {
      if (colIdx >= itemCol && colIdx !== itemCol && colKeys[colIdx]) {
        row[colKeys[colIdx]] = val;
      }
    });

    for (let i = 0; i < itemCol; i++) {
      row[colKeys[i]] = cascadingLeftValues[colKeys[i]][depth] ?? "";
    }

    row[colKeys[itemCol]] = hierarchyValues[0] ?? "";

    subItemCols.forEach((col, i) => {
      row[col] = hierarchyValues[i + 1] ?? "";
    });

    rows.push(row);
  });

  return { rows, levelCols: subItemCols };
}

/** ✅ FINAL clean version */
export function flattenOcrData(data: OCRComponent[]): ExtractedData {
  const components = data.filter(
    (c) => c.cells && !["HEADER", "BODY_TEXT", "TABLE_COLS"].includes(c.type)
  );

  const { keys, positions } = extractColumns(data);
  const itemCol = detectItemColumn(components, positions);
  const idToDepth = resolveLevels(components);

  const { rows, levelCols } = buildRows({
    components,
    colKeys: keys,
    colXs: positions,
    itemCol,
    idToDepth
  });

  const finalCols: string[] = [];
  keys.forEach((k, i) => {
    finalCols.push(k);
    if (i === itemCol) finalCols.push(...levelCols);
  });

  return { columns: finalCols, rows };
}
