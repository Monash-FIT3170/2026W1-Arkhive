import type { ExtractedData, ExtractedPage, ExtractedRow } from '../../../models/TableData';
import type { AppliedEdits, Intent } from '../../../models/message';

// ─────────────────────────────────────────────────────────────────────────────
// Page-aware intent application
//
// The page is: one ACTIVE table (top-level columns/rows, identified by
// page.tableId), any number of parked tables (page.otherTables), plus
// key/value `fields` and `texts`. Every function below returns a new page and
// reports exactly what it changed, so callers never claim success on a no-op.
// ─────────────────────────────────────────────────────────────────────────────

export type Grid = ExtractedData;

const sameId = (a: unknown, b: unknown) => String(a) === String(b);

/** The grid for a tableId (active grid when omitted / equal to page.tableId). */
export function getGrid(page: ExtractedPage, tableId?: string): Grid | undefined {
  if (!tableId || tableId === page.tableId) return page;
  return page.otherTables?.find((t) => t.tableId === tableId);
}

function rowExists(grid: Grid | undefined, rowId: unknown): boolean {
  return !!grid?.rows.some((r) => sameId(r._id, rowId));
}

/**
 * Which table holds this row? Trust the model's tableId if the row is really
 * there, otherwise search (row ids come from the flattener and are unique per
 * block, but the model can still mislabel the table).
 */
function locateRow(page: ExtractedPage, rowId: unknown, hinted?: string): string | undefined {
  if (hinted && rowExists(getGrid(page, hinted), rowId)) return hinted;
  if (rowExists(page, rowId)) return page.tableId;
  return page.otherTables?.find((t) => rowExists(t, rowId))?.tableId;
}

/** Apply fn to one table and write the result back to the right place on the page. */
function editGrid(
  page: ExtractedPage,
  tableId: string | undefined,
  fn: (g: Grid) => Grid
): ExtractedPage {
  if (!tableId || tableId === page.tableId) {
    const next = fn(page);
    return { ...page, columns: next.columns, rows: next.rows, itemColumnKey: next.itemColumnKey };
  }
  const others = page.otherTables ?? [];
  if (!others.some((t) => t.tableId === tableId)) return page; // unknown table: no-op
  return {
    ...page,
    otherTables: others.map((t) => {
      if (t.tableId !== tableId) return t;
      const next = fn(t);
      return { ...t, columns: next.columns, rows: next.rows, itemColumnKey: next.itemColumnKey };
    }),
  };
}

/** Set cell values. Only counts edits where both the row and the column exist. */
function setCells(
  grid: Grid,
  edits: { rowId: string | number; column: string; newValue: string }[]
): { grid: Grid; applied: { rowId: string | number; column: string }[] } {
  const applied: { rowId: string | number; column: string }[] = [];
  // "scores" / "Scores" / "SCORES " all mean the SCORES column.
  const resolved = edits.map((e) => ({ ...e, column: resolveColumn(grid, e.column) ?? e.column }));
  const rows = grid.rows.map((row) => {
    const mine = resolved.filter(
      (e) =>
        sameId(e.rowId, row._id) && grid.columns.includes(e.column) && !e.column.startsWith('_')
    );
    if (!mine.length) return row;
    const next: ExtractedRow = { ...row, _cellConfidence: { ...row._cellConfidence } };
    for (const e of mine) {
      next[e.column] = e.newValue ?? '';
      next._cellConfidence[e.column] = 1; // human-confirmed; keep in sync with useTableEditor.editCell
      applied.push({ rowId: row._id, column: e.column });
    }
    return next;
  });
  return { grid: { ...grid, rows }, applied };
}

/** Rename columns (columns are the flattener's keys). Moves every per-column map with them. */
function renameColumns(
  grid: Grid,
  updates: { from: string; to: string }[]
): { grid: Grid; count: number } {
  const valid = updates.filter(
    (u) =>
      grid.columns.includes(u.from) &&
      !isDerivedColumn(grid, u.from) &&
      u.to &&
      u.to !== u.from &&
      !grid.columns.includes(u.to)
  );
  if (!valid.length) return { grid, count: 0 };
  const map = new Map(valid.map((u) => [u.from, u.to]));
  // SUB_ columns are named after the item column; carry them along so they stay recognisable.
  const renamedItem = map.get(grid.itemColumnKey);
  if (renamedItem) {
    for (const c of grid.columns) {
      const d = subDepth(grid, c);
      if (d !== null) map.set(c, `SUB_${renamedItem}_${d}`);
    }
  }
  return {
    count: valid.length,
    grid: {
      ...grid,
      columns: grid.columns.map((c) => map.get(c) ?? c),
      itemColumnKey: map.get(grid.itemColumnKey) ?? grid.itemColumnKey,
      rows: grid.rows.map((row) => {
        const next: ExtractedRow = {
          ...row,
          _cellConfidence: { ...row._cellConfidence },
          _cellKeyMap: row._cellKeyMap ? { ...row._cellKeyMap } : undefined,
        };
        for (const [from, to] of map) {
          if (from in next) {
            next[to] = next[from];
            delete next[from];
          }
          if (from in next._cellConfidence) {
            next._cellConfidence[to] = next._cellConfidence[from];
            delete next._cellConfidence[from];
          }
          if (next._cellKeyMap && from in next._cellKeyMap) {
            next._cellKeyMap[to] = next._cellKeyMap[from];
            delete next._cellKeyMap[from];
          }
        }
        return next;
      }),
    },
  };
}

function deleteColumns(grid: Grid, names: string[]): { grid: Grid; count: number } {
  const del = new Set(
    names.filter(
      (c) => grid.columns.includes(c) && c !== grid.itemColumnKey && !isDerivedColumn(grid, c)
    )
  );
  if (!del.size) return { grid, count: 0 };
  return {
    count: del.size,
    grid: {
      ...grid,
      columns: grid.columns.filter((c) => !del.has(c)),
      rows: grid.rows.map((row) => {
        const next: ExtractedRow = {
          ...row,
          _cellConfidence: { ...row._cellConfidence },
          _cellKeyMap: row._cellKeyMap ? { ...row._cellKeyMap } : undefined,
        };
        del.forEach((c) => {
          delete next[c];
          delete next._cellConfidence[c];
          if (next._cellKeyMap) delete next._cellKeyMap[c];
        });
        return next;
      }),
    },
  };
}

/**
 * Apply an LLM intent to a page. Returns the new page and what actually changed.
 * `applied.total === 0` means nothing matched and the caller must not pretend otherwise.
 */
function applyIntentToPage(
  page: ExtractedPage,
  intent: Intent
): { page: ExtractedPage; applied: AppliedEdits & { total: number } } {
  let result = page;
  const tableIds = new Set<string>();
  const cells: { rowId: string | number; column: string }[] = [];
  const blockIds: string[] = [];
  let total = 0;

  const touch = (tableId: string | undefined) => {
    const id = tableId ?? result.tableId;
    if (id) tableIds.add(id);
  };

  const applyCellEdits = (
    edits: { rowId: string | number; column: string; newValue: string; tableId?: string }[]
  ) => {
    // group by the table that really holds each row
    const groups = new Map<string, typeof edits>();
    for (const e of edits) {
      const tid = locateRow(result, e.rowId, e.tableId ?? intent.tableId) ?? '';
      groups.set(tid, [...(groups.get(tid) ?? []), e]);
    }
    for (const [tid, group] of groups) {
      result = editGrid(result, tid || undefined, (g) => {
        const r = setCells(g, group);
        if (r.applied.length) {
          cells.push(...r.applied);
          total += r.applied.length;
          touch(tid || undefined);
        }
        return r.grid;
      });
    }
  };

  switch (intent.type) {
    case 'correction':
      if (intent.rowId != null && intent.column && intent.newValue != null) {
        applyCellEdits([{ rowId: intent.rowId, column: intent.column, newValue: intent.newValue }]);
      }
      break;

    case 'bulk_update':
      applyCellEdits(intent.bulkUpdates ?? []);
      break;

    case 'column_correction':
      result = editGrid(result, intent.tableId, (g) => {
        const r = renameColumns(g, intent.updates ?? []);
        if (r.count) {
          total += r.count;
          touch(intent.tableId);
        }
        return r.grid;
      });
      break;

    case 'column_delete':
      result = editGrid(result, intent.tableId, (g) => {
        const r = deleteColumns(g, intent.deletedColumns ?? []);
        if (r.count) {
          total += r.count;
          touch(intent.tableId);
        }
        return r.grid;
      });
      break;

    case 'field_correction':
      if (intent.blockId && intent.newValue != null) {
        const id = intent.blockId;
        const newValue = intent.newValue;
        const hitField = result.fields?.some((f) => f.id === id);
        const hitText = result.texts?.some((t) => t.id === id);
        if (hitField || hitText) {
          result = {
            ...result,
            fields: result.fields?.map((f) => (f.id === id ? { ...f, value: newValue } : f)),
            texts: result.texts?.map((t) => (t.id === id ? { ...t, text: newValue } : t)),
          };
          blockIds.push(id);
          total += 1;
        }
      }
      break;
  }

  return { page: result, applied: { tableIds: [...tableIds], cells, blockIds, total } };
}

const EDIT_INTENTS: Intent['type'][] = [
  'correction',
  'column_correction',
  'column_delete',
  'bulk_update',
  'field_correction',
];

// ─────────────────────────────────────────────────────────────────────────────
// Making model output usable
//
// The model fills a flat schema where nearly everything is optional, and a small
// model does so loosely: the right value in the wrong field, "previous" for
// PREVIOUS, "Table 1" for a tableId. None of that is ambiguous to a person, so
// resolve it here instead of silently doing nothing.
// ─────────────────────────────────────────────────────────────────────────────

/** Case / spacing / punctuation-insensitive key: "Sub Item 1" === "SUB_ITEM_1". */
const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

/** Depth of a `SUB_<item>_<n>` column, or null. These are managed by indent/outdent. */
function subDepth(grid: Grid, column: string): number | null {
  const prefix = `SUB_${grid.itemColumnKey}_`;
  if (!column.startsWith(prefix)) return null;
  const rest = column.slice(prefix.length);
  return /^\d+$/.test(rest) ? Number(rest) : null;
}

function isDerivedColumn(grid: Grid, column: string): boolean {
  return subDepth(grid, column) !== null;
}

/** Resolve a (possibly sloppy) column name to the real column key. */
export function resolveColumn(grid: Grid, name: unknown): string | undefined {
  const s = String(name ?? '').trim();
  if (!s) return undefined;
  if (grid.columns.includes(s)) return s;
  const n = norm(s);
  return n ? grid.columns.find((c) => norm(c) === n) : undefined;
}

function allTableIds(page: ExtractedPage): string[] {
  return [page.tableId, ...(page.otherTables ?? []).map((t) => t.tableId)].filter(
    (id): id is string => !!id
  );
}

/** Real tableId for what the model said: an id, a tab label ("Table 2"), or nothing -> the active table. */
export function resolveTableId(page: ExtractedPage, hinted?: string): string | undefined {
  const ids = allTableIds(page);
  if (!hinted) return page.tableId;
  if (ids.includes(hinted)) return hinted;
  const order = page.tableOrder ?? ids;
  const byLabel = order.findIndex((_, i) => norm(hinted) === `table${i + 1}`);
  if (byLabel >= 0) return order[byLabel];
  return page.tableId;
}

/** Column names the user wants deleted, wherever the model happened to put them. */
function requestedDeletions(intent: Intent): string[] {
  const loose = intent as Intent & { oldValue?: string };
  return [
    ...(intent.deletedColumns ?? []),
    ...(intent.column ? [intent.column] : []),
    ...(loose.oldValue ? [loose.oldValue] : []),
    ...(intent.updates ?? []).map((u) => u.from),
  ].filter((n) => String(n ?? '').trim() !== '');
}

/** Rename requests, from `updates` or from column/oldValue + newValue. */
function requestedRenames(intent: Intent): { from: string; to: string }[] {
  if (intent.updates?.length) return intent.updates;
  const loose = intent as Intent & { oldValue?: string };
  const from = intent.column ?? loose.oldValue;
  return from && intent.newValue ? [{ from, to: intent.newValue }] : [];
}

/**
 * If none of `names` exist in the chosen table, use the first table that has one
 * of them (the model sometimes picks the active table when the user meant another).
 */
function tableHavingColumns(page: ExtractedPage, preferred: string | undefined, names: string[]) {
  const candidates = [preferred, ...allTableIds(page)].filter((id): id is string => !!id);
  for (const id of candidates) {
    const grid = getGrid(page, id);
    if (grid && names.some((n) => resolveColumn(grid, n))) return id;
  }
  return preferred;
}

/** A copy of the intent with tableId, column names and misplaced fields repaired. */
export function normalizeIntent(page: ExtractedPage, intent: Intent): Intent {
  let tableId = resolveTableId(page, intent.tableId);
  const next: Intent = { ...intent };

  if (intent.type === 'column_delete') {
    const names = requestedDeletions(intent);
    tableId = tableHavingColumns(page, tableId, names);
    const grid = getGrid(page, tableId) ?? page;
    next.deletedColumns = [
      ...new Set(names.map((n) => resolveColumn(grid, n)).filter((c): c is string => !!c)),
    ];
  } else if (intent.type === 'column_correction') {
    const renames = requestedRenames(intent);
    tableId = tableHavingColumns(
      page,
      tableId,
      renames.map((r) => r.from)
    );
    const grid = getGrid(page, tableId) ?? page;
    next.updates = renames.map((r) => ({ from: resolveColumn(grid, r.from) ?? r.from, to: r.to }));
  } else if (intent.type === 'correction' && intent.column) {
    next.column = resolveColumn(getGrid(page, tableId) ?? page, intent.column) ?? intent.column;
  } else if (intent.type === 'bulk_update' && intent.bulkUpdates) {
    // NEW: Normalize the tableId and column for every item in the bulkUpdates array
    next.bulkUpdates = intent.bulkUpdates.map((u) => {
      const uTableId = resolveTableId(page, u.tableId ?? tableId);
      const grid = getGrid(page, uTableId) ?? page;
      return {
        ...u,
        tableId: uTableId,
        column: resolveColumn(grid, u.column) ?? u.column,
      };
    });
  }
  next.tableId = tableId;
  return next;
}

/** Why a set of cell edits matched nothing: unknown rows or columns. */
function explainCellEdits(
  page: ExtractedPage,
  intent: Intent,
  edits: { rowId?: string | number; column?: string; tableId?: string }[]
): string {
  const problems = new Set<string>();
  for (const e of edits) {
    const tid = locateRow(page, e.rowId, e.tableId ?? intent.tableId);
    if (!tid) {
      problems.add(`row "${e.rowId}" doesn't exist in any table`);
      continue;
    }
    const g = getGrid(page, tid) ?? page;
    if (!resolveColumn(g, e.column))
      problems.add(`there is no column called "${e.column}" (columns: ${g.columns.join(', ')})`);
  }
  return problems.size ? `${[...problems].join('; ')}.` : 'those cells could not be edited.';
}

/**
 * Plain-English reason an intent changed nothing. Used both to tell the user the
 * truth and to tell the model what to fix on a retry.
 */
export function explainMiss(page: ExtractedPage, original: Intent): string {
  const intent = normalizeIntent(page, original);
  const grid = getGrid(page, intent.tableId) ?? page;
  const cols = grid.columns.filter((c) => !isDerivedColumn(grid, c)).join(', ');
  const table = intent.tableId ? ` in that table` : '';

  switch (original.type) {
    case 'column_delete': {
      const names = requestedDeletions(original);
      if (!names.length) return `no column was named for deletion. The columns are: ${cols}.`;
      const reasons = names.map((n) => {
        const c = resolveColumn(grid, n);
        if (!c) return `there is no column called "${n}"${table} (columns: ${cols})`;
        if (c === grid.itemColumnKey)
          return `"${c}" is the main item column, which can't be deleted`;
        if (isDerivedColumn(grid, c))
          return `"${c}" is created automatically by nesting rows, so it can't be deleted directly`;
        return `"${c}" couldn't be deleted`;
      });
      return `${reasons.join('; ')}.`;
    }
    case 'column_correction': {
      const renames = requestedRenames(original);
      if (!renames.length) return `no column rename was specified. The columns are: ${cols}.`;
      return `${renames
        .map((r) => {
          const c = resolveColumn(grid, r.from);
          if (!c) return `there is no column called "${r.from}"${table} (columns: ${cols})`;
          if (isDerivedColumn(grid, c))
            return `"${c}" is created automatically by nesting rows, so it can't be renamed`;
          if (!r.to || norm(r.to) === norm(c))
            return `the new name for "${c}" is the same or empty`;
          if (grid.columns.includes(r.to)) return `a column called "${r.to}" already exists`;
          return `"${c}" couldn't be renamed`;
        })
        .join('; ')}.`;
    }
    case 'correction': {
      const missing = [
        original.rowId == null && 'which row',
        !original.column && 'which column',
        original.newValue == null && 'the new value',
      ].filter(Boolean);
      if (missing.length) return `the edit didn't say ${missing.join(', ')}.`;
      return explainCellEdits(page, intent, [
        { rowId: original.rowId, column: original.column, tableId: original.tableId },
      ]);
    }
    case 'bulk_update': {
      const edits = original.bulkUpdates ?? [];
      if (!edits.length) return 'no cell edits were specified.';
      return explainCellEdits(page, intent, edits);
    }
    case 'field_correction':
      return `there is no field or text block with id "${original.blockId}".`;
    default:
      return 'nothing matched.';
  }
}

/** Run an intent against the page; returns what the endpoints should send back. */
export function resolveEdit(page: ExtractedPage | undefined, intent: Intent | null | undefined) {
  if (!page || !intent || !EDIT_INTENTS.includes(intent.type)) {
    return {
      updatedContext: undefined,
      applied: undefined,
      nothingMatched: false,
      reason: undefined as string | undefined,
      normalizedIntent: intent, // Added
    };
  }
  const normalized = normalizeIntent(page, intent);
  console.log(normalized);
  const { page: next, applied } = applyIntentToPage(page, normalized);
  if (applied.total === 0) {
    return {
      updatedContext: undefined,
      applied: undefined,
      nothingMatched: true,
      reason: explainMiss(page, intent) as string | undefined,
      normalizedIntent: normalized, // Added
    };
  }
  const { total: _total, ...rest } = applied;
  return {
    updatedContext: next,
    applied: rest as AppliedEdits,
    nothingMatched: false,
    reason: undefined as string | undefined,
    normalizedIntent: normalized, // Added
  };
}

/**
 * Apply the model's intent; if it changed nothing, tell the model why and let it
 * correct itself ONCE; if it still changes nothing, replace the model's (false)
 * "done!" reply with the actual reason so the UI never claims a no-op succeeded.
 *
 * `retry` sends the correction request and returns the model's new parsed reply.
 * A failed retry is not fatal: the original reason is reported instead.
 */
export async function resolveWithRetry<R extends { response?: string; intent?: Intent | null }>(
  page: ExtractedPage | undefined,
  first: R,
  retry: (reason: string) => Promise<R | null | undefined>
) {
  let parsed = first;
  let outcome = resolveEdit(page, parsed.intent);

  if (outcome.nothingMatched) {
    const next = await retry(outcome.reason ?? 'nothing matched').catch(() => null);
    if (next) {
      const second = resolveEdit(page, next.intent);
      if (!second.nothingMatched) {
        parsed = next;
        outcome = second;
      }
    }
  }

  if (outcome.nothingMatched) {
    parsed = {
      ...parsed,
      response: `I couldn't make that change: ${outcome.reason ?? 'nothing in the document matched.'}`,
      intent: null, // no Accept/Reject buttons for a no-op
    };
  } else if (parsed.intent) {
    // NEW: Push the cleaned intent back onto the parsed payload so the UI can read it
    parsed.intent = outcome.normalizedIntent;
  }

  const { updatedContext, applied } = outcome;
  return { parsed, updatedContext, applied };
}
