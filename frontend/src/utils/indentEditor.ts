import type { ExtractedPage, ExtractedRow } from '../models/TableData';

export type IndentDirection = 'in' | 'out';

/**
 * HOW HIERARCHY IS REPRESENTED IN THE GRID
 *
 * The source of truth is each row's `_indentLevel` plus the row's OWN text in
 * the item column. Everything else about the hierarchy is a derived view of
 * those two things (this mirrors what flattener.tableToExtractedData produces):
 *
 *   - Item band: for a row at depth d, the item column holds the root ancestor's
 *     text, `SUB_<item>_k` holds the level-k ancestor's text for k <= d, and
 *     deeper `SUB_` slots are empty. The row's own text sits at depth d.
 *   - Left-of-item columns (code, category...) inherit the nearest ancestor
 *     (or self) that has its own non-empty value.
 *
 * `restructure()` is the ONE place that re-derives that view. Every operation
 * that changes levels, order, or ancestor text (indent, outdent, move, delete,
 * editing an item-band cell) goes through it, so the grid can't drift out of
 * sync with the hierarchy. It never mutates its input (undo snapshots share
 * row objects with the live page).
 */

// ==========================================
// NAMING / DEPTH HELPERS
// ==========================================

export function subItemColumnName(itemColumnKey: string, depth: number): string {
  return `SUB_${itemColumnKey}_${depth}`;
}

/** Depth of a `SUB_<item>_<n>` column, or null if `column` isn't one. (No regex: item names can contain anything.) */
export function subItemDepth(column: string, itemColumnKey: string): number | null {
  const prefix = `SUB_${itemColumnKey}_`;
  if (!column.startsWith(prefix)) return null;
  const rest = column.slice(prefix.length);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

/** 0 for the item column, n for `SUB_<item>_n`, null for any other column. */
export function itemBandDepth(page: { itemColumnKey: string }, column: string): number | null {
  if (column === page.itemColumnKey) return 0;
  return subItemDepth(column, page.itemColumnKey);
}

/** SUB_ columns are managed by indent/outdent — users shouldn't rename or delete them by hand. */
export function isDerivedColumn(page: { itemColumnKey: string }, column: string): boolean {
  return subItemDepth(column, page.itemColumnKey) !== null;
}

const levelOf = (row: ExtractedRow): number => row._indentLevel ?? 0;

/** Index one past the last row of `rows[index]`'s subtree (the row plus every following deeper row). */
export function subtreeEnd(rows: ExtractedRow[], index: number): number {
  const level = levelOf(rows[index]);
  let end = index + 1;
  while (end < rows.length && levelOf(rows[end]) > level) end++;
  return end;
}

/** A row can only nest under the row directly above it, so it can go at most one level deeper than that row. */
export function canIndentIndex(rows: ExtractedRow[], index: number): boolean {
  return index > 0 && levelOf(rows[index]) <= levelOf(rows[index - 1]);
}

export function canOutdentIndex(rows: ExtractedRow[], index: number): boolean {
  return index >= 0 && index < rows.length && levelOf(rows[index]) > 0;
}

export function canIndent(page: ExtractedPage, rowId: string | number): boolean {
  return canIndentIndex(
    page.rows,
    page.rows.findIndex((r) => String(r._id) === String(rowId))
  );
}

export function canOutdent(page: ExtractedPage, rowId: string | number): boolean {
  return canOutdentIndex(
    page.rows,
    page.rows.findIndex((r) => String(r._id) === String(rowId))
  );
}

// ==========================================
// CELL HELPERS
// ==========================================

interface OwnCell {
  value: string;
  confidence: number;
  ref?: string;
}

/** Reads a row's own item text. `restructure` defaults to reading it from the current item band. */
type OwnReader = (row: ExtractedRow, itemColumnKey: string) => OwnCell;

function cloneRow(row: ExtractedRow): ExtractedRow {
  return {
    ...row,
    _cellConfidence: { ...(row._cellConfidence ?? {}) },
    _cellKeyMap: { ...(row._cellKeyMap ?? {}) },
  };
}

/** A row's own item text, read at its CURRENT depth. */
function readOwnItem(row: ExtractedRow, itemColumnKey: string): OwnCell {
  const col = levelOf(row) === 0 ? itemColumnKey : subItemColumnName(itemColumnKey, levelOf(row));
  return {
    value: String(row[col] ?? ''),
    confidence: row._cellConfidence?.[col] ?? row._confidence ?? 1,
    ref: row._cellKeyMap?.[col],
  };
}

function writeCell(
  row: ExtractedRow,
  col: string,
  value: string,
  confidence: number,
  ref?: string
) {
  row[col] = value;
  row._cellConfidence[col] = confidence;
  if (ref) row._cellKeyMap![col] = ref;
  else delete row._cellKeyMap![col];
}

/** True when `row` itself (not an ancestor) is the source of its left-column value. */
function ownsLeftValue(row: ExtractedRow, col: string): boolean {
  if (String(row[col] ?? '').trim() === '') return false;
  const ref = row._cellKeyMap?.[col];
  return ref === undefined || ref.startsWith(`${String(row._id)}:`);
}

/** Adds `SUB_` columns up to `maxLevel` (placed after the deepest existing one) and drops any deeper than that. */
function syncSubColumns(columns: string[], itemColumnKey: string, maxLevel: number): string[] {
  const next = columns.filter((c) => {
    const d = subItemDepth(c, itemColumnKey);
    return d === null || d <= maxLevel;
  });
  for (let depth = 1; depth <= maxLevel; depth++) {
    const name = subItemColumnName(itemColumnKey, depth);
    if (next.includes(name)) continue;
    const anchor = depth === 1 ? itemColumnKey : subItemColumnName(itemColumnKey, depth - 1);
    const at = next.indexOf(anchor);
    next.splice(at === -1 ? next.length : at + 1, 0, name);
  }
  return next;
}

// ==========================================
// RESTRUCTURE
// ==========================================

/**
 * Applies `transform` to a copy of the rows (reorder, remove, change
 * `_indentLevel`...), then re-derives the item band and inherited left columns
 * so they match the new levels/order. Each row keeps its own item text, wherever
 * it ends up.
 *
 * `transform` receives deep-enough clones it may freely mutate; it must not add
 * rows (their own text would be unknown).
 *
 * `readOwn` says where each row's own item text currently lives. The default
 * reads it from the existing item band; `setItemColumn` overrides it because
 * the new item column has no band yet.
 */
export function restructure(
  page: ExtractedPage,
  transform: (rows: ExtractedRow[]) => ExtractedRow[],
  readOwn: OwnReader = readOwnItem
): ExtractedPage {
  const itemKey = page.itemColumnKey;
  if (!itemKey || !page.columns.includes(itemKey)) {
    return { ...page, rows: transform(page.rows.map(cloneRow)) };
  }

  // 1. Each row's own item text, captured at its CURRENT level, before anything moves.
  const own = new Map<string, OwnCell>();
  for (const r of page.rows) own.set(String(r._id), readOwn(r, itemKey));

  // 2. Transform clones, then force levels to be valid (first row 0, never > previous + 1).
  const rows = transform(page.rows.map(cloneRow));
  let prev = -1;
  for (const r of rows) {
    r._indentLevel = Math.min(Math.max(0, levelOf(r)), prev + 1);
    prev = r._indentLevel;
  }
  const maxLevel = rows.reduce((m, r) => Math.max(m, levelOf(r)), 0);

  const columns = syncSubColumns(page.columns, itemKey, maxLevel);
  const itemIdx = columns.indexOf(itemKey);
  const leftCols = columns.filter((c, i) => i < itemIdx && subItemDepth(c, itemKey) === null);
  const droppedSubCols = page.columns.filter(
    (c) => !columns.includes(c) && subItemDepth(c, itemKey) !== null
  );

  // 3. Re-derive each row's band + inherited left columns from its ancestors.
  const path: ExtractedRow[] = []; // path[k] = ancestor at level k (path[level] = the row itself)
  for (const row of rows) {
    const level = levelOf(row);
    path.length = level;
    path.push(row);

    for (let k = 0; k <= maxLevel; k++) {
      const col = k === 0 ? itemKey : subItemColumnName(itemKey, k);
      const rowConfidence = row._confidence ?? 1;
      if (k > level) {
        writeCell(row, col, '', rowConfidence);
        continue;
      }
      const src = own.get(String(path[k]._id)) ?? readOwn(path[k], itemKey);
      const absent = src.value === '' && !src.ref;
      writeCell(row, col, src.value, absent ? rowConfidence : src.confidence, src.ref);
    }

    for (const col of leftCols) {
      if (ownsLeftValue(row, col)) continue; // its own value stays
      let from: ExtractedRow | undefined;
      for (let k = level - 1; k >= 0; k--) {
        if (ownsLeftValue(path[k], col)) {
          from = path[k];
          break;
        }
      }
      if (from) {
        // Always stamp an owner ref so descendants never mistake the copy for an own value.
        const ref = from._cellKeyMap![col] ?? `${String(from._id)}:${col}`;
        writeCell(row, col, String(from[col]), from._cellConfidence[col], ref);
      } else {
        writeCell(row, col, '', row._confidence ?? 1);
      }
    }

    for (const col of droppedSubCols) {
      delete row[col];
      delete row._cellConfidence[col];
      delete row._cellKeyMap![col];
    }
  }

  return { ...page, columns, rows };
}

// ==========================================
// REINDENTING
// ==========================================

/**
 * Moves one row — and its whole subtree (every following row deeper than it) —
 * in or out by one level. Returns the SAME page object when nothing can change
 * (first row, already at max/min depth), which usePageMutation treats as a no-op.
 *
 * Note on outdent: later siblings that were at the row's old level stay where
 * they are, so they become children of the outdented row — the standard outline
 * behaviour (Workflowy, Notion, Docs).
 */
export function reindentRow(
  page: ExtractedPage,
  rowId: string | number,
  direction: IndentDirection
): ExtractedPage {
  const index = page.rows.findIndex((r) => String(r._id) === String(rowId));
  if (index === -1) return page;

  const allowed =
    direction === 'in' ? canIndentIndex(page.rows, index) : canOutdentIndex(page.rows, index);
  if (!allowed) return page;

  const delta = direction === 'in' ? 1 : -1;
  const end = subtreeEnd(page.rows, index);

  return restructure(page, (rows) => {
    for (let i = index; i < end; i++) rows[i]._indentLevel = levelOf(rows[i]) + delta;
    return rows;
  });
}

// ==========================================
// CHOOSING THE INDENT COLUMN
// ==========================================

/**
 * Makes `newKey` the column the hierarchy is carried by. Row levels are kept;
 * only the text that fills the item band changes.
 *
 *  1. Capture each row's own text in the NEW column (if it sat left of the old
 *     item column, child-row values there are inherited copies, not own text).
 *  2. Collapse the old band: own text goes back into the old item column and
 *     the SUB_ columns are dropped. The old column is now an ordinary column.
 *  3. Re-derive the band from the new column via `restructure`.
 *
 * Returns the SAME page when nothing can change.
 */
export function setItemColumn(page: ExtractedPage, newKey: string): ExtractedPage {
  const oldKey = page.itemColumnKey;
  if (
    newKey === oldKey ||
    !page.columns.includes(newKey) ||
    !page.columns.includes(oldKey) ||
    isDerivedColumn(page, newKey)
  ) {
    return page;
  }

  const wasLeft = page.columns.indexOf(newKey) < page.columns.indexOf(oldKey);
  const ownNew = new Map<string, OwnCell>();
  for (const r of page.rows) {
    const owns = !wasLeft || ownsLeftValue(r, newKey);
    ownNew.set(String(r._id), {
      value: owns ? String(r[newKey] ?? '') : '',
      confidence: r._cellConfidence?.[newKey] ?? r._confidence ?? 1,
      ref: owns ? r._cellKeyMap?.[newKey] : undefined,
    });
  }

  const derived = page.columns.filter((c) => isDerivedColumn(page, c));
  const collapsed: ExtractedPage = {
    ...page,
    itemColumnKey: newKey,
    columns: page.columns.filter((c) => !derived.includes(c)),
    rows: page.rows.map((r) => {
      const row = cloneRow(r);
      const own = readOwnItem(r, oldKey);
      for (const c of derived) {
        delete row[c];
        delete row._cellConfidence[c];
        delete row._cellKeyMap![c];
      }
      writeCell(row, oldKey, own.value, own.confidence, own.ref);
      return row;
    }),
  };

  return restructure(
    collapsed,
    (rows) => rows,
    (r) => ownNew.get(String(r._id))!
  );
}

/**
 * Every row's level, keyed by row id. Feed this to the flattener as
 * `manualIndentLevels` (a COMPLETE override, so detected and manual levels are
 * never mixed on different scales).
 */
export function indentLevelsOf(page: ExtractedPage): Record<string, number> {
  return Object.fromEntries(page.rows.map((r) => [String(r._id), levelOf(r)]));
}
