import type { ExtractedData, ExtractedPage, ExtractedRow } from '../../../../models/TableData';
import type { OCRComponent, Page, Pages } from '../../../../models/OCRComponent';
import { da } from 'zod/locales';

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
  level: number;
  cells: Record<string, CellData>; // Mapped by column key - cells in row
  children: TreeNode[]; // Rows whose are indented underneath this row
}

export interface FlattenerOptions {
  /**
   * Manual nesting-depth overrides, keyed by OCRComponent id.
   * 0 = top-level. 1 = nested one level under the nearest preceding row
   * with a lower resolved level. Always wins over `parentId` for that
   * specific row. Rows without an entry fall back to `parentId`,
   * compared against whatever is currently on the stack — so a manual
   * override can start a fresh nesting scope that later un-overridden
   * rows still nest into automatically.
   */
  manualIndentLevels?: Record<string, number>;
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

/** Column-related bounding box keys (`col_0`, `col_1`, ...) in column order. */
function getColumnBBKeys(component: OCRComponent): string[] {
  return Object.keys(component.boundingBoxes ?? {})
    .filter((k) => /^col_\d+$/.test(k))
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
}

function resolveColumnIndex(rawCol: string | undefined): number | null {
  if (!rawCol) return null;
  const match = rawCol.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

export function getMidX(component: OCRComponent, key: string): number | null {
  const verts = component.boundingBoxes?.[key]?.vertices;
  if (!verts?.length) return null;
  const xs = verts.map((v) => Number(v.x));
  return (Math.min(...xs) + Math.max(...xs)) / 2;
}

/**
 * Estimates a reasonable "this counts as one indent level" distance, scaled to the
 * table's own geometry
 *
 * Basing the threshold on a fraction of the average column width keeps it valid
 * regardless of the coordinate system the OCR engine happens to use.
 */
function estimateIndentThreshold(positions: number[]): number {
  if (positions.length < 2) return 0.01; // any positive delta counts
  const gaps = positions.slice(1).map((p, i) => p - positions[i]);
  const avgColWidth = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return Math.max(avgColWidth * 0.1, 0.01);
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
  const bbKeys = getColumnBBKeys(c);
  const firstPopulatedKey = bbKeys.find((k) => c.boundingBoxes?.[k]?.text?.trim() !== '');

  const verts = firstPopulatedKey ? c.boundingBoxes?.[firstPopulatedKey]?.vertices : undefined;

  if (verts?.length) {
    return Math.min(...verts.map((v) => Number(v.x)));
  }
  return c.indentation ?? 0;
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
  console.log(colComp);
  const bbKeys = colComp ? getColumnBBKeys(colComp) : [];

  const rawCols = colComp?.cells?.length
    ? colComp.cells
    : bbKeys.map((k) => colComp!.boundingBoxes![k].text);

  const keys = rawCols.map(normalizeColKey);
  const positions = rawCols.map((_, i) => getMidX(colComp!, bbKeys[i]) ?? i * 100);

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
    const bbKeys = getColumnBBKeys(c);
    //for each component increment the column counter for the first item
    const firstPopulatedKey = bbKeys.find((k) => c.boundingBoxes?.[k]?.text?.trim() !== '');
    const startX = firstPopulatedKey ? getMidX(c, firstPopulatedKey) : null; // x coordinate of the first column in component
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
  //   const bbKeys = getColumnBBKeys(comp);
  //   let lastColIdx = -1;

  comp.cells?.forEach((value, i) => {
    const bbKey = `col_${i}`; // cells[i] IS column i — look the box up directly
    const box = comp.boundingBoxes?.[bbKey];
    const rawCol = box?.column;

    let colIdx = resolveColumnIndex(rawCol); //Column index reported by the box itself

    if (colIdx === null || colIdx < 0 || colIdx >= keys.length) {
      // No usable "column" field on the box (or no box at all): trust
      // the cell's real position in the row.
      colIdx = i;
    } else if (box) {
      // A box exists and reports a column — cross-check it against
      // geometry in case that field is stale, nudging to the closest
      // column by x-position rather than blindly trusting either source.
      const midX = getMidX(comp, bbKey);
      if (midX !== null) {
        colIdx = findClosestIndex(midX, positions);
      }
    }

    if (keys[colIdx]) {
      result[keys[colIdx]] = {
        //Make the cell data representation
        value,
        confidence: box?.confidence ?? comp.confidence,
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
function buildTree(
  components: OCRComponent[],
  keys: string[],
  positions: number[],
  options?: FlattenerOptions
) {
  const roots: TreeNode[] = [];
  const stack: TreeNode[] = []; // Stack of "active" parents a row can be a child of
  let maxDepth = 0;
  const INDENT_THRESHOLD = estimateIndentThreshold(positions);
  const manualLevels = options?.manualIndentLevels ?? {};
  const nodesById = new Map<string, TreeNode>();

  for (const comp of components) {
    const cells = mapCellsToColumns(comp, keys, positions);
    const rawIndent = getIndent(comp);
    const manualLevel = manualLevels[comp.id];

    let level: number;
    let parentNode: TreeNode | undefined;

    if (manualLevel !== undefined) {
      // A person has decided this row's depth explicitly. Pop anything
      // at the same or deeper level - it's not this node's parent.
      level = manualLevel;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }
      parentNode = stack[stack.length - 1];
    } else if (comp.parentId && nodesById.has(comp.parentId)) {
      // Trust the explicit link, but only when it actually resolves.
      parentNode = nodesById.get(comp.parentId);
      level = parentNode!.level + 1;

      // Re-sync the geometric stack to this row's real ancestry, so any
      // later rows that fall back to geometry still nest correctly
      // relative to it.
      const idx = stack.indexOf(parentNode!);
      stack.length = idx >= 0 ? idx + 1 : 0;
      if (idx < 0) stack.push(parentNode!);
    } else {
      // No override, no (usable) parentId: fall back to comparing
      // against whatever is currently on the stack (which may itself be
      // a manually-placed or parentId-placed row).
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        const isDeeper = rawIndent > top.indent + INDENT_THRESHOLD;
        if (isDeeper) {
          level = top.level + 1;
          parentNode = top;
          break;
        }
        stack.pop();
      }
      // @ts-expect-error assigned in the loop above when a parent is found
      if (typeof level === 'undefined') level = 0;
    }

    const node: TreeNode = {
      id: comp.id,
      confidence: comp.confidence,
      indent: rawIndent,
      level,
      cells,
      children: [],
    };

    nodesById.set(comp.id, node);

    if (!parentNode) {
      roots.push(node); //If there is no parent to be a child of, row must be a parent/root node
    } else {
      // It must be a child of the resolved parent
      parentNode.children.push(node);
    }

    maxDepth = Math.max(maxDepth, node.level);
    stack.push(node);
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
      _indentLevel: node.level,
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
        const provider = [...path].reverse().find((n) => {
          const val = n.cells[colKey]?.value;
          return val !== undefined && val.trim() !== '';
        });
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
 * @param options Options to determine nesting
 * @returns flattened ExtractedData
 */
export function flatten(data: OCRComponent[], options?: FlattenerOptions): ExtractedData {
  const components = data.filter((c) => c.type === 'TABLE_ROW');

  // Parse Structure
  const { keys, positions } = extractColumns(data);
  const itemColIdx = detectItemColumn(components, positions);
  const itemColKey = keys[itemColIdx];

  // Build Tree
  const { roots, maxDepth } = buildTree(components, keys, positions, options);
  const subItemCols = Array.from({ length: maxDepth }, (_, i) => `SUB_${itemColKey}_${i + 1}`); // Build array of column names for nested columns

  // Traverse & Generate Rows
  const rows = flattenTree(roots, [], keys, itemColIdx, subItemCols);

  // Final columns schema (injecting sub items directly after the main item column)
  const finalCols = keys.flatMap((k, i) => (i === itemColIdx ? [k, ...subItemCols] : [k]));

  return { columns: finalCols, rows };
}

/** Flattens a multi-page OCR response into one ExtractedPage per page. */
export function flattenPages(pages: Pages, options?: FlattenerOptions): ExtractedPage[] {
  return pages.map((page: Page) => ({
    ...flatten(page.components, options),
    pageIndex: page.page_num - 1,
  }));
}
