import type { ExtractedData, ExtractedRow } from '../../../../models/TableData';
import type { OCRComponent } from '../../../../models/OCRComponent';

export function normalizeColKey(col: string): string {
  return col
    .replace(/\(.*?\)/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, '_')
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

/** Confidence for a specific cell, falling back to the component's overall confidence */
export function cellConfidence(component: OCRComponent, cellIndex: number): number {
  return component.boundingBoxes?.[`cell_${cellIndex}`]?.confidence ?? component.confidence;
}

/** Helper to find the index of the closest number */
function findClosestIndex(target: number, values: number[], startIndex = 0): number {
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
  const colComp = data.find((c) => c.type === 'TABLE_COLS');
  const rawCols = colComp?.cells ?? [];

  const keys = rawCols.map(normalizeColKey);
  const positions = rawCols.map(
    (_, i) => (colComp ? cellMidX(colComp, `cell_${i}`) : null) ?? i * 100
  );

  return { keys, positions };
}

/** Detect main item column */
export function detectItemColumn(components: OCRComponent[], colXs: number[]): number {
  const freq = new Map<number, number>();

  components.forEach((c) => {
    const startX = cellMidX(c, 'cell_0');
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
    const verts = c.boundingBoxes?.['cell_0']?.vertices;
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

/** A single mapped cell: its value, which column it landed in, and how confident OCR was */
type MappedCell = { val: string; colIdx: number; confidence: number };

function mapComponentCells(
  component: OCRComponent,
  colKeys: string[],
  colXs: number[]
): MappedCell[] {
  let lastColIdx = -1;
  return (component.cells ?? []).map((val, i) => {
    const colIdx = resolveCellColIdx(component, i, colKeys, colXs, lastColIdx);
    lastColIdx = colIdx;
    return { val, colIdx, confidence: cellConfidence(component, i) };
  });
}

/** One cascade slot: the value/confidence currently "in effect" at a given depth */
type CascadeEntry = { value: string; confidence: number };

/**
 * Updates a per-column cascade stack for the current depth.
 * If this row has its own value for the column, use it.
 * Otherwise inherit the nearest ancestor's value+confidence (or a blank default at depth 0).
 */
function updateCascade(
  cascade: CascadeEntry[],
  depth: number,
  match: MappedCell | undefined,
  fallbackConfidence: number
): CascadeEntry {
  const entry: CascadeEntry = match
    ? { value: match.val, confidence: match.confidence }
    : depth > 0
      ? (cascade[depth - 1] ?? { value: '', confidence: fallbackConfidence })
      : { value: '', confidence: fallbackConfidence };

  cascade[depth] = entry;
  cascade.length = depth + 1;
  return entry;
}

type BuildRowsParams = {
  components: OCRComponent[];
  colKeys: string[];
  colXs: number[];
  itemCol: number;
  idToDepth: Map<string, number>;
};

export function buildRows({ components, colKeys, colXs, itemCol, idToDepth }: BuildRowsParams): {
  rows: ExtractedRow[];
  levelCols: string[];
} {
  const maxDepth = Math.max(...idToDepth.values(), 0);
  const subItemCols = Array.from(
    { length: maxDepth },
    (_, i) => `SUB_${colKeys[itemCol]}_${i + 1}`
  );

  const rows: ExtractedRow[] = [];

  // One cascade stack per left-side (hierarchy-defining) column, plus one for the item column itself
  const leftCascades: Record<string, CascadeEntry[]> = {};
  for (let i = 0; i < itemCol; i++) leftCascades[colKeys[i]] = [];
  const itemCascade: CascadeEntry[] = [];

  components.forEach((component) => {
    const depth = idToDepth.get(component.id) ?? 0;
    const mappedCells = mapComponentCells(component, colKeys, colXs);
    const fallbackConfidence = component.confidence;

    const row: ExtractedRow = {
      _id: component.id,
      _confidence: component.confidence,
      _cellConfidence: {},
    };
    [...colKeys, ...subItemCols].forEach((col) => (row[col] = ''));

    mappedCells.forEach(({ val, colIdx, confidence }) => {
      if (colIdx >= itemCol && colIdx !== itemCol && colKeys[colIdx]) {
        row[colKeys[colIdx]] = val;
        row._cellConfidence[colKeys[colIdx]] = confidence;
      }
    });

    for (let i = 0; i < itemCol; i++) {
      const colKey = colKeys[i];
      const match = mappedCells.find((mc) => mc.colIdx === i);
      const { value, confidence } = updateCascade(
        leftCascades[colKey],
        depth,
        match,
        fallbackConfidence
      );
      row[colKey] = value;
      row._cellConfidence[colKey] = confidence;
    }

    const itemMatch = mappedCells.find((mc) => mc.colIdx === itemCol);
    const { value: itemValue, confidence: itemConfidence } = updateCascade(
      itemCascade,
      depth,
      itemMatch,
      fallbackConfidence
    );
    row[colKeys[itemCol]] = depth === 0 ? itemValue : (itemCascade[0]?.value ?? '');
    row._cellConfidence[colKeys[itemCol]] =
      depth === 0 ? itemConfidence : (itemCascade[0]?.confidence ?? fallbackConfidence);

    subItemCols.forEach((col, i) => {
      const entry = itemCascade[i + 1];
      row[col] = entry?.value ?? '';
      row._cellConfidence[col] = entry?.confidence ?? fallbackConfidence;
    });

    rows.push(row);
  });

  return { rows, levelCols: subItemCols };
}

/** ✅ FINAL clean version */
export function flattenOcrData(data: OCRComponent[]): ExtractedData {
  const components = data.filter(
    (c) => c.cells && !['HEADER', 'BODY_TEXT', 'TABLE_COLS'].includes(c.type)
  );

  const { keys, positions } = extractColumns(data);
  const itemCol = detectItemColumn(components, positions);
  const idToDepth = resolveLevels(components);

  const { rows, levelCols } = buildRows({
    components,
    colKeys: keys,
    colXs: positions,
    itemCol,
    idToDepth,
  });

  const finalCols: string[] = [];
  keys.forEach((k, i) => {
    finalCols.push(k);
    if (i === itemCol) finalCols.push(...levelCols);
  });

  return { columns: finalCols, rows };
}
