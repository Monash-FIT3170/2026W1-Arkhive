/**
 * Hierarchy from outline numbering ("1", "1.1", "1.1.1", "2)", "(3)").
 * Pure and provider-neutral: takes plain cell text, returns levels.
 *
 * Decimals like prices ("5.00") and quantities ("1.5") look like numbering, so a
 * column only counts when it behaves like an outline: nearly every deep number
 * ("1.2") must have its parent ("1") appear earlier in the same column.
 */

export interface NumberingLevels {
  columnKey: string;
  /** One level per input row, same order. */
  levels: number[];
}

export interface NumberingOptions {
  /** Min share of the column's non-empty cells that must start with a number. */
  minCoverage?: number;
  /** Min share of deep numbers whose parent number appeared earlier. */
  minConsistency?: number;
}

// 1-3 digit groups so dates ("2024-01-01") and thousands ("10,000") don't match.
const NUM = /^\s*\(?(\d{1,3}(?:\.\d{1,3})*)[.)]?(?=\s|$)/;

export function parseNumbering(text: string): number[] | null {
  const m = NUM.exec(text);
  return m ? m[1].split('.').map(Number) : null;
}

export function detectNumberingLevels(
  rows: Record<string, string>[],
  columnKeys: string[],
  { minCoverage = 0.7, minConsistency = 0.8 }: NumberingOptions = {}
): NumberingLevels | null {
  let best: (NumberingLevels & { matched: number }) | null = null;

  for (const key of columnKeys) {
    const parsed = rows.map((r) => parseNumbering(r[key] ?? ''));
    const nonEmpty = rows.filter((r) => (r[key] ?? '').trim()).length;
    const matched = parsed.filter(Boolean).length;
    if (!nonEmpty || matched < Math.max(3, rows.length * 0.4)) continue;
    if (matched / nonEmpty < minCoverage) continue;

    const seen = new Set<string>();
    let deep = 0;
    let consistent = 0;
    for (const parts of parsed) {
      if (!parts) continue;
      if (parts.length > 1) {
        deep++;
        if (seen.has(parts.slice(0, -1).join('.'))) consistent++;
      }
      seen.add(parts.join('.'));
    }
    if (deep === 0 || consistent / deep < minConsistency) continue;

    // Unnumbered rows (wrapped text, unnumbered items) keep the previous row's level.
    let prev = 0;
    const levels = parsed.map((parts) => (prev = parts ? parts.length - 1 : prev));
    if (!best || matched > best.matched) best = { columnKey: key, levels, matched };
  }

  return best && { columnKey: best.columnKey, levels: best.levels };
}
