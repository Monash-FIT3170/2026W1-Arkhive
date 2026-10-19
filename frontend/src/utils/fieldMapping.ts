import type { ExtractedData, ExtractedRow } from '../models/TableData';

export type DocumentType = 'receipt' | 'invoice' | 'form' | 'record';

export const DOCUMENT_TYPES: readonly DocumentType[] = ['receipt', 'invoice', 'form', 'record'];

export interface FieldMappingRule {
  /** Column name as extracted (or as renamed by the user in the table). */
  from: string;
  /** Column name wanted in the exported file. */
  to: string;
}

export interface FieldMapping {
  documentType: DocumentType;
  /**
   * Mapped columns appear first, in the order the rules are listed.
   * Columns that no rule mentions come after them in their original order.
   */
  rules: FieldMappingRule[];
  /** What to do with columns no rule mentions. Defaults to 'keep'. */
  unmapped?: 'keep' | 'drop';
}

/**
 * Normalises a column name so "PRICE_LIST", "Price List" and "price-list" are
 * treated as the same column when matching a rule against the data.
 */
export function normalizeFieldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function validateFieldMapping(mapping: FieldMapping): string[] {
  const problems: string[] = [];
  const seenFrom = new Set<string>();
  const seenTo = new Set<string>();

  mapping.rules.forEach((rule, index) => {
    const label = `Rule ${index + 1}`;
    const from = normalizeFieldName(rule.from);
    const to = rule.to.trim();

    if (!from) problems.push(`${label}: the source column name is empty.`);
    if (!to) problems.push(`${label}: the target column name is empty.`);

    if (from) {
      if (seenFrom.has(from)) {
        problems.push(`${label}: source column "${rule.from}" is mapped more than once.`);
      }
      seenFrom.add(from);
    }
    if (to) {
      if (seenTo.has(to)) {
        problems.push(`${label}: target column "${to}" is used more than once.`);
      }
      seenTo.add(to);
    }
  });

  return problems;
}

export function findUnmatchedRules(data: ExtractedData, mapping: FieldMapping): FieldMappingRule[] {
  const present = new Set(data.columns.map(normalizeFieldName));
  return mapping.rules.filter((rule) => !present.has(normalizeFieldName(rule.from)));
}

function remapKeys<V>(
  record: Record<string, V> | undefined,
  sourceOrder: string[],
  targetOf: (source: string) => string
): Record<string, V> | undefined {
  if (!record) return undefined;
  const result: Record<string, V> = {};
  for (const source of sourceOrder) {
    if (source in record) result[targetOf(source)] = record[source];
  }
  return result;
}

export function applyFieldMapping<T extends ExtractedData>(data: T, mapping: FieldMapping): T {
  const problems = validateFieldMapping(mapping);
  if (problems.length > 0) {
    throw new Error(`Invalid field mapping. ${problems.join(' ')}`);
  }

  // Source column -> wanted name. A Map keeps insertion order, which is rule order.
  const renamed = new Map<string, string>();
  for (const rule of mapping.rules) {
    const wanted = normalizeFieldName(rule.from);
    const source = data.columns.find(
      (col) => !renamed.has(col) && normalizeFieldName(col) === wanted
    );
    if (source !== undefined) renamed.set(source, rule.to.trim());
  }

  const keptUnmapped =
    (mapping.unmapped ?? 'keep') === 'keep' ? data.columns.filter((col) => !renamed.has(col)) : [];
  const sourceOrder = [...renamed.keys(), ...keptUnmapped];
  const targetOf = (source: string) => renamed.get(source) ?? source;
  const columns = sourceOrder.map(targetOf);

  const duplicate = columns.find((name, index) => columns.indexOf(name) !== index);
  if (duplicate !== undefined) {
    throw new Error(
      `Field mapping would create two columns named "${duplicate}". Map or drop the other one.`
    );
  }

  const rows = data.rows.map((row) => {
    // Start from a copy so metadata (_id, _confidence, ...) and any extra fields survive.
    const result: ExtractedRow = { ...row };
    for (const col of data.columns) delete result[col];
    for (const source of sourceOrder) {
      if (source in row) result[targetOf(source)] = row[source];
    }
    result._cellConfidence = remapKeys(row._cellConfidence, sourceOrder, targetOf) ?? {};
    const cellKeyMap = remapKeys(row._cellKeyMap, sourceOrder, targetOf);
    if (cellKeyMap) result._cellKeyMap = cellKeyMap;
    return result;
  });

  let itemColumnKey = data.itemColumnKey;
  if (data.columns.includes(itemColumnKey)) {
    itemColumnKey = sourceOrder.includes(itemColumnKey) ? targetOf(itemColumnKey) : '';
  }

  return { ...data, columns, rows, itemColumnKey };
}
