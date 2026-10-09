import type {
  ExtractedData,
  ExtractedPage,
  ExtractedRow,
  ExtractedTableSnapshot,
  TableTab,
} from '../models/TableData';
import type { Block, Cell, StructuredPage, TableBlock, TableRow } from '../models/Document';

export interface FlattenerOptions {
  manualIndentLevels?: Record<string, number>;
}

interface Node {
  row: TableRow;
  level: number;
  path: Node[];
}

/**
 * Projection of ONE TableBlock into the existing flat grid (ExtractedData).
 * Same inheritance semantics as before; flattening is now a view, not the data model.
 * Manual overrides win over detected levels and re-derive ancestry via the same stack.
 */
export function tableToExtractedData(
  block: TableBlock,
  opts: FlattenerOptions = {}
): ExtractedData {
  const manual = opts.manualIndentLevels ?? {};
  const keys = block.columns.map((c) => c.key);
  const itemIdx = Math.max(0, keys.indexOf(block.itemColumnKey));
  const itemKey = keys[itemIdx];

  const stack: Node[] = [];
  const nodes: Node[] = block.rows.map((row) => {
    const level = manual[row.id] ?? row.level;
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const node: Node = { row, level, path: [] };
    node.path = [...(stack[stack.length - 1]?.path ?? []), node];
    stack.push(node);
    return node;
  });

  const maxDepth = Math.max(0, ...nodes.map((n) => n.path.length - 1));
  const subCols = Array.from({ length: maxDepth }, (_, i) => `SUB_${itemKey}_${i + 1}`);

  const rows: ExtractedRow[] = nodes.map(({ row, path }) => {
    const out: ExtractedRow = {
      _id: row.id,
      _confidence: row.confidence,
      _indentLevel: path.length - 1,
      _cellConfidence: {},
      _cellKeyMap: {},
    };
    const set = (col: string, cell: Cell | undefined, ownerId: string, srcKey: string) => {
      out[col] = cell?.text ?? '';
      out._cellConfidence[col] = cell?.confidence ?? row.confidence;
      if (cell) out._cellKeyMap![col] = `${ownerId}:${srcKey}`; // look up region via rows[ownerId].cells[srcKey]
    };

    keys.forEach((k, i) => {
      if (i < itemIdx) {
        // left of item column: inherit nearest non-empty ancestor
        const p = [...path].reverse().find((n) => n.row.cells[k]?.text.trim());
        set(k, p?.row.cells[k], p?.row.id ?? row.id, k);
      } else if (i === itemIdx) {
        // root value + one sub column per depth
        set(k, path[0].row.cells[k], path[0].row.id, k);
        subCols.forEach((s, d) =>
          set(s, path[d + 1]?.row.cells[k], path[d + 1]?.row.id ?? row.id, k)
        );
      } else {
        set(k, row.cells[k], row.id, k); // right of item column: this row only
      }
    });
    return out;
  });

  return {
    columns: keys.flatMap((k, i) => (i === itemIdx ? [k, ...subCols] : [k])),
    rows,
    itemColumnKey: itemKey,
  };
}

/**
 * The table that is loaded into the grid by default when a page has several:
 * the one with the most rows (the others are usually small summary/total boxes).
 * The user can switch to any other table afterwards.
 */
export function pickPrimaryTable(blocks: Block[]): TableBlock | undefined {
  return blocks
    .filter((b): b is TableBlock => b.kind === 'table')
    .reduce<TableBlock | undefined>(
      (best, t) => (!best || t.rows.length > best.rows.length ? t : best),
      undefined
    );
}

/**
 * StructuredPage -> ExtractedPage (what the validation editor consumes).
 *
 * - The primary table fills the top-level grid (columns/rows), so existing
 *   editing hooks keep working.
 * - Every other table is parked in `otherTables` and can be swapped in.
 * - Field and text blocks are carried alongside as `fields` / `texts`.
 * Pages with no table come back with an empty grid so page numbering stays intact.
 */
export function pageToExtractedPage(
  page: StructuredPage,
  opts: FlattenerOptions = {}
): ExtractedPage {
  const tables = page.blocks.filter((b): b is TableBlock => b.kind === 'table');
  const primary = pickPrimaryTable(page.blocks);

  const grid: ExtractedData = primary
    ? tableToExtractedData(primary, opts)
    : { columns: [], rows: [], itemColumnKey: '' };

  const otherTables: ExtractedTableSnapshot[] = tables
    .filter((t) => t !== primary)
    .map((t) => ({ ...tableToExtractedData(t, opts), tableId: t.id }));

  return {
    ...grid,
    pageIndex: page.pageIndex,
    tableId: primary?.id,
    tableOrder: tables.map((t) => t.id),
    otherTables,
    fields: page.blocks.flatMap((b) =>
      b.kind === 'field'
        ? [{ id: b.id, key: b.key, label: b.label, value: b.value, confidence: b.confidence }]
        : []
    ),
    texts: page.blocks.flatMap((b) =>
      b.kind === 'text' ? [{ id: b.id, role: b.role, text: b.text, confidence: b.confidence }] : []
    ),
  };
}

/**
 * Load another of the page's tables into the top-level grid. The table that
 * was loaded is parked in `otherTables`, edits included, so nothing is lost.
 * Returns the same object if there is nothing to switch to.
 */
export function switchActiveTable(page: ExtractedPage, tableId: string): ExtractedPage {
  if (!page.tableId || page.tableId === tableId) return page;
  const target = page.otherTables?.find((t) => t.tableId === tableId);
  if (!target) return page;

  const parked: ExtractedTableSnapshot = {
    tableId: page.tableId,
    columns: page.columns,
    rows: page.rows,
    itemColumnKey: page.itemColumnKey,
  };
  return {
    ...page,
    columns: target.columns,
    rows: target.rows,
    itemColumnKey: target.itemColumnKey,
    tableId,
    otherTables: [...(page.otherTables ?? []).filter((t) => t.tableId !== tableId), parked],
  };
}

/** Tabs for the table switcher, in document order. Empty when the page has no table. */
export function listTables(page: ExtractedPage): TableTab[] {
  if (!page.tableId) return [];
  const byId = new Map<string, ExtractedData>();
  byId.set(page.tableId, page);
  for (const t of page.otherTables ?? []) byId.set(t.tableId, t);
  const order = page.tableOrder ?? [page.tableId];
  return order
    .filter((id) => byId.has(id))
    .map((id, i) => ({ id, label: `Table ${i + 1}`, rowCount: byId.get(id)!.rows.length }));
}
