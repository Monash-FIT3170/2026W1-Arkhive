/** Stable identity for a page across reloads: `${documentId}:${pageIndex}`. */
export const makePageKey = (documentId: string, pageIndex: number): string =>
  `${documentId}:${pageIndex}`;

export function parsePageKey(pageKey: string): { documentId: string; pageIndex: number } | null {
  const i = pageKey.lastIndexOf(':');
  if (i < 0) return null;
  const pageIndex = Number(pageKey.slice(i + 1));
  return Number.isInteger(pageIndex) ? { documentId: pageKey.slice(0, i), pageIndex } : null;
}

/** A cell within one page: `${rowId}:${column}`. Only unique *per page*. */
export const makeFieldId = (rowId: string | number, column: string): string => `${rowId}:${column}`;

/**
 * Splits on the FIRST colon, so column names containing ':' survive
 * (the old `fieldId.split(':')` silently truncated them).
 */
export function parseFieldId(fieldId: string): { rowId: string; column: string } {
  const i = fieldId.indexOf(':');
  return i < 0
    ? { rowId: fieldId, column: '' }
    : { rowId: fieldId.slice(0, i), column: fieldId.slice(i + 1) };
}
