import type { ExtractedData, ExtractedRow } from '../../../../models/TableData';
import type { OCRComponent } from '../../../../models/OCRComponent';

// ==========================================
// TYPES & INTERFACES
// ==========================================

interface CellData {
  //Represents 1 cell in row
  value: string; //Value of the cell
  confidence: number; // Confidence value of the celll
  ref: string; //reference ID
}

interface TreeNode {
  //Represents a row
  id: string; //unique ID
  confidence: number; //Confidence of the row
  indent: number; // indent in the row
  cells: Record<string, CellData>; // Mapped by column key - cells in row
  children: TreeNode[]; // Rows whose are indented underneath this row
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

export function normalizeColKey(col: string): string {
  return col
    .replace(/\(.*?\)/g, '')
    .replace(/\./g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}

export function getMidX(component: OCRComponent, key: string): number | null {
  const verts = component.boundingBoxes?.[key]?.vertices;
  if (!verts?.length) return null;
  const xs = verts.map((v) => Number(v.x));
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/**
 * Function that finds the columns column number that the component is assigned to
 * @param target x coordinate of the comp
 * @param values list of x-coordinates for middle for each column
 * @param startIndex column number that is first to be considered
 * @returns the column index
 */
function findClosestIndex(target: number, values: number[], startIndex = 0): number {
  let bestIdx = startIndex;
  let minScore = Infinity;
  for (let j = startIndex; j < values.length; j++) {
    //Find column index whose closest to target
    const score = Math.abs(target - values[j]);
    if (score < minScore) {
      minScore = score;
      bestIdx = j;
    }
  }
  return bestIdx;
}

function getIndent(c: OCRComponent): number {
  const verts = c.boundingBoxes?.['cell_0']?.vertices;
  const baseIndent = c.indentation ?? 0;
  if (!verts?.length) return baseIndent;
  return (Math.min(...verts.map((v) => Number(v.x))) + baseIndent) / 2;
}

// ==========================================
// COLUMN PARSING & CELL MAPPING
// ==========================================

/**
 * Function that extracts the column
 * @param data RAW OCR Data
 * @returns keys - list of column names, positions - the mid x position of each column
 */
export function extractColumns(data: OCRComponent[]) {
  const colComp = data.find((c) => c.type === 'TABLE_COLS');
  const rawCols = colComp?.cells ?? [];

  const keys = rawCols.map(normalizeColKey);
  const positions = rawCols.map((_, i) => getMidX(colComp!, `cell_${i}`) ?? i * 100);

  return { keys, positions };
}

/**
 *  Function that attempts to find the main column that contains nested items
 * @param components RAW OCR Data
 * @param colXs The mid x position of each column
 * @returns The column that contains the most components
 */
export function detectItemColumn(components: OCRComponent[], colXs: number[]): number {
  if (!components.length || !colXs.length) return 0;

  const counts = new Array(colXs.length).fill(0);
  for (const c of components) {
    //for each component increment the column counter for the first item
    const startX = getMidX(c, 'cell_0'); // x coordinate of the first column in component
    if (startX !== null) {
      counts[findClosestIndex(startX, colXs)]++;
    }
  }

  return counts.indexOf(Math.max(...counts));
}

/**
 * Parses a flat array of component cells into a dictionary mapped to column keys
 * @param comp Components of RAW OCR
 * @param keys Column Headers
 * @param positions Middle X position of each Column in Table
 * @returns Record of <column key - cell>
 */
function mapCellsToColumns(
  comp: OCRComponent,
  keys: string[],
  positions: number[]
): Record<string, CellData> {
  const result: Record<string, CellData> = {};
  let lastColIdx = -1;

  comp.cells?.forEach((value, i) => {
    const bbKey = `cell_${i}`; //Key of the cell
    const rawCol = comp.boundingBoxes?.[bbKey]?.column; //Column assigned to this cell

    let colIdx = rawCol ? keys.indexOf(normalizeColKey(rawCol)) : -1; //Column index

    // Fallback to spatial X coordinate if no explicit column matches
    if (colIdx === -1) {
      const midX = getMidX(comp, bbKey) ?? 0;
      const safeStart = Math.min(lastColIdx + 1, positions.length - 1); //Only consider columns greater then the previous column
      colIdx = findClosestIndex(midX, positions, safeStart);
    }

    lastColIdx = colIdx;

    if (keys[colIdx]) {
      result[keys[colIdx]] = {
        //Make the cell data representation
        value,
        confidence: comp.boundingBoxes?.[bbKey]?.confidence ?? comp.confidence,
        ref: `${comp.id}:${bbKey}`,
      };
    }
  });

  return result;
}

// ==========================================
// TREE BUILDING
// ==========================================

/**
 * Constructs a parent-child tree hierarchy based on spatial indentation
 * @param components RAW OCR components
 * @param keys Column Keys
 * @param positions Mid X position of each column
 * @returns { roots, maxDepth } - roots are top level of the tree (nodes no parent), maximum depth of the tree
 */
function buildTree(components: OCRComponent[], keys: string[], positions: number[]) {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = []; // Stack of "active" parents a row can be a child of
  let maxDepth = 0;
  const INDENT_THRESHOLD = 6;

  for (const comp of components) {
    const node: TreeNode = {
      //For each component (row) make a TreeNode representation
      id: comp.id,
      confidence: comp.confidence,
      indent: getIndent(comp),
      cells: mapCellsToColumns(comp, keys, positions), //List of cells in that row
      children: [],
    };

    // Pop the stack until we find the appropriate parent based on indentation
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (node.indent > top.indent + INDENT_THRESHOLD) {
        //If a row has greater indentation then parent (must be a child)
        top.children.push(node);
        maxDepth = Math.max(maxDepth, stack.length); // stack length acts as depth
        break;
      }
      stack.pop(); //If it isn't a child, the stack's top isn't a parent canadidate anymore (no longer active)
    }

    if (stack.length === 0) {
      //If there is no parents to be a child of, the row must be parent row
      roots.push(node);
    }

    stack.push(node); // Add the new row be the the new current parent
  }

  return { roots, maxDepth };
}

// ==========================================
// TREE TRAVERSAL & FLATTENING
// ==========================================

/**
 * Recursively flattens the tree into table rows, inheriting data from ancestors
 * @param nodes Current TreeNode (Row) tht is being converted into ExtractedRow
 * @param ancestors Previous Row/Parents of the current TreeNode
 * @param keys Column keys
 * @param itemColIdx The column index of the main item column (column that contains nested rows)
 * @param subItemCols Column key names for the nested childern
 * @returns List of ExtractedRow
 */
function flattenTree(
  nodes: TreeNode[],
  ancestors: TreeNode[],
  keys: string[],
  itemColIdx: number,
  subItemCols: string[]
): ExtractedRow[] {
  return nodes.flatMap((node) => {
    // For each node in the convert over into a extractedrow (flatten)
    const path = [...ancestors, node]; // Full lineage of the current node

    const row: ExtractedRow = {
      _id: node.id,
      _confidence: node.confidence,
      _cellConfidence: {},
      _cellKeyMap: {},
    };

    // Helper to assign a cell to the ExtractedRow
    const setCell = (colKey: string, cell?: CellData) => {
      row[colKey] = cell?.value ?? '';
      row._cellConfidence[colKey] = cell?.confidence ?? node.confidence;
      if (cell) row._cellKeyMap![colKey] = cell.ref;
    };

    // Apply inheritance rules across columns
    for (let i = 0; i < keys.length; i++) {
      const colKey = keys[i]; //Column Name being assigned

      if (i < itemColIdx) {
        // Columns before the MAIN Column
        // Left Side: Inherit from the closest ancestor that has this column
        const provider = [...path].reverse().find((n) => n.cells[colKey]);
        setCell(colKey, provider?.cells[colKey]);
      } else if (i === itemColIdx) {
        // Main Item Column: Always use the absolute root value
        setCell(colKey, path[0]?.cells[colKey]);

        // Sub Item Columns: Each level of depth fills the respective sub-column
        subItemCols.forEach((subKey, d) => {
          const ancestorAtDepth = path[d + 1];
          setCell(subKey, ancestorAtDepth?.cells[colKey]);
        });
      } else {
        // Right Side: Independent data, map directly from current node
        setCell(colKey, node.cells[colKey]);
      }
    }

    // Traverse recursively
    return [row, ...flattenTree(node.children, path, keys, itemColIdx, subItemCols)];
  });
}

// ==========================================
// MAIN EXPORT
// ==========================================

/**
 *  Flatten RAW OCR data into flattened ExtractedData
 * @param data RAW OCR data
 * @returns flattened ExtractedData
 */
export function flatten(data: OCRComponent[]): ExtractedData {
  const components = data.filter(
    (c) => c.cells && !['HEADER', 'BODY_TEXT', 'TABLE_COLS'].includes(c.type)
  );

  // Parse Structure
  const { keys, positions } = extractColumns(data);
  const itemColIdx = detectItemColumn(components, positions);
  const itemColKey = keys[itemColIdx];

  // Build Tree
  const { roots, maxDepth } = buildTree(components, keys, positions);
  const subItemCols = Array.from({ length: maxDepth }, (_, i) => `SUB_${itemColKey}_${i + 1}`); // Build array of column names for nested columns

  // Traverse & Generate Rows
  const rows = flattenTree(roots, [], keys, itemColIdx, subItemCols);

  // Final columns schema (injecting sub items directly after the main item column)
  const finalCols = keys.flatMap((k, i) => (i === itemColIdx ? [k, ...subItemCols] : [k]));

  return { columns: finalCols, rows };
}
