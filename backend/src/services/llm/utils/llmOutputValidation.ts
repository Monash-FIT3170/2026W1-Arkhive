import type { ExtractedData } from '../../../models/TableData';

/**
 * Checks on what Gemini sends back, before we change the table or hand the
 * answer to the frontend. A model can be tricked by text on a scanned page,
 * so its reply is treated as a suggestion, not as something safe to apply.
 */

export const INTENT_REJECTED_RESPONSE =
  "I couldn't apply that change because it doesn't match a row or column in the table.";
export const INTENT_PARTIAL_NOTE =
  ' Some changes were skipped because they did not match the table.';

/** Intent types that change the table. Everything else is just conversation. */
export const MUTATING_INTENT_TYPES = [
  'correction',
  'column_correction',
  'column_delete',
  'bulk_update',
] as const;

const MAX_VALUE_LENGTH = 500;
const MAX_COLUMN_NAME_LENGTH = 100;
const MAX_REGEX_LENGTH = 200;
const BLOCKED_COLUMN_NAMES = new Set(['__proto__', 'constructor', 'prototype']);

/** Extra limits for calls that are only allowed to touch specific cells. */
export type IntentLimits = {
  /** The one mutating intent type this call may return. */
  expectedType?: string;
  /** Only this column may be edited. */
  column?: string;
  /** Only these row ids may be edited. */
  rowIds?: string[];
};

export type SanitizedIntent = {
  intent: any;
  /** How many requested changes were thrown away. */
  dropped: number;
  /** True when nothing usable was left and the intent was replaced. */
  rejected: boolean;
};

function reject(): SanitizedIntent {
  return { intent: { type: 'unclear' }, dropped: 0, rejected: true };
}

function cleanValue(value: unknown): string | null {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof text !== 'string' || text.length > MAX_VALUE_LENGTH) return null;
  return text;
}

function idKey(value: unknown): string | null {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** A new column name must be plain text and must not look like an internal field. */
function isSafeColumnName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= MAX_COLUMN_NAME_LENGTH &&
    !name.startsWith('_') &&
    !BLOCKED_COLUMN_NAMES.has(name) &&
    !hasControlChars(name)
  );
}

/**
 * Keeps only the parts of a model intent that point at a real row and a real
 * column of this table. Anything else is dropped, and if nothing is left the
 * intent is replaced with 'unclear' so the table is not touched.
 */
export function sanitizeIntent(
  context: ExtractedData | undefined,
  intent: any,
  limits?: IntentLimits
): SanitizedIntent {
  if (!intent || typeof intent !== 'object') {
    return { intent: intent ?? null, dropped: 0, rejected: false };
  }

  if (!(MUTATING_INTENT_TYPES as readonly string[]).includes(intent.type)) {
    return { intent, dropped: 0, rejected: false };
  }

  // Without a table there is nothing to check the change against.
  if (!context) return reject();
  if (limits?.expectedType && intent.type !== limits.expectedType) return reject();

  const rowIds = new Set(context.rows.map((row) => String(row._id)));
  const columns = new Set(context.columns);
  const allowedRows = limits?.rowIds ? new Set(limits.rowIds) : null;

  const cellIsAllowed = (rowId: unknown, column: unknown): boolean => {
    const id = idKey(rowId);
    if (id === null || typeof column !== 'string') return false;
    if (!rowIds.has(id) || !columns.has(column)) return false;
    if (allowedRows && !allowedRows.has(id)) return false;
    if (limits?.column !== undefined && column !== limits.column) return false;
    return true;
  };

  // Start without the list fields so a correction cannot smuggle in a delete.
  const base = { ...intent, updates: undefined, deletedColumns: undefined, bulkUpdates: undefined };

  switch (intent.type) {
    case 'correction': {
      const newValue = cleanValue(intent.newValue);
      if (newValue === null || !cellIsAllowed(intent.rowId, intent.column)) return reject();
      return { intent: { ...base, newValue }, dropped: 0, rejected: false };
    }

    case 'bulk_update': {
      if (!Array.isArray(intent.bulkUpdates)) return reject();
      const seen = new Set<string>();
      const valid: { rowId: unknown; column: string; newValue: string }[] = [];
      for (const update of intent.bulkUpdates) {
        const newValue = cleanValue(update?.newValue);
        if (newValue === null || !cellIsAllowed(update?.rowId, update?.column)) continue;
        const key = JSON.stringify([String(update.rowId), update.column]);
        if (seen.has(key)) continue;
        seen.add(key);
        valid.push({ rowId: update.rowId, column: update.column, newValue });
      }
      if (valid.length === 0) return reject();
      return {
        intent: { ...base, bulkUpdates: valid },
        dropped: intent.bulkUpdates.length - valid.length,
        rejected: false,
      };
    }

    case 'column_correction': {
      if (!Array.isArray(intent.updates)) return reject();
      const seenFrom = new Set<string>();
      const seenTo = new Set<string>();
      const valid: { from: string; to: string }[] = [];
      for (const update of intent.updates) {
        if (typeof update?.from !== 'string' || typeof update?.to !== 'string') continue;
        const to = update.to.trim();
        if (!columns.has(update.from) || seenFrom.has(update.from)) continue;
        if (to === update.from || !isSafeColumnName(to)) continue;
        // Renaming onto an existing column would overwrite its data.
        if (columns.has(to) || seenTo.has(to)) continue;
        seenFrom.add(update.from);
        seenTo.add(to);
        valid.push({ from: update.from, to });
      }
      if (valid.length === 0) return reject();
      return {
        intent: { ...base, updates: valid },
        dropped: intent.updates.length - valid.length,
        rejected: false,
      };
    }

    case 'column_delete': {
      if (!Array.isArray(intent.deletedColumns)) return reject();
      const valid = [
        ...new Set(
          intent.deletedColumns.filter(
            (col: unknown): col is string => typeof col === 'string' && columns.has(col)
          )
        ),
      ];
      // Deleting every column would wipe the table.
      if (valid.length === 0 || valid.length >= context.columns.length) return reject();
      return {
        intent: { ...base, deletedColumns: valid },
        dropped: intent.deletedColumns.length - valid.length,
        rejected: false,
      };
    }

    default:
      return reject();
  }
}

/**
 * Format regexes from the model are later run against every cell in a column.
 * Only keep ones that compile, are short, and do not nest quantifiers
 * (patterns like (a+)+ can hang the browser).
 */
export function sanitizeFormatRegex(regex: unknown): string | null {
  if (typeof regex !== 'string' || regex.length === 0 || regex.length > MAX_REGEX_LENGTH) {
    return null;
  }
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(regex)) return null;
  try {
    new RegExp(regex);
  } catch {
    return null;
  }
  return regex;
}
