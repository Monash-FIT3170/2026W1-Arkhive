/**
 * Table hierarchy, as a pipeline of small pure stages (provider-neutral, no I/O):
 *
 *   pickItemIndex     which column carries the description / hierarchy?
 *   toVirtualRows     Azure grid rows  ->  one row per visual item
 *                       (a) unmerge   : merged cells are copied onto every row they cover
 *                       (b) split     : "Parent / - Child / - Child" in ONE cell becomes three rows
 *   assignLevels      nesting depth per row: numbering > bullet markers > left-edge geometry
 *   parentIndexes     parent row per row, from levels alone
 *   dropInheritedCells  a merged-cell copy is redundant when an ancestor row already carries it
 *
 * Every stage returns new data; the extractors only compose them. The LLM path reuses
 * pickItemIndex / assignLevels / parentIndexes, so native and LLM tables nest identically.
 */
import { type RawCell, type RawWord, groupBy, leftEdge, unionPolygon, yCentre } from './layout';
import { detectNumberingLevels } from './numbering';

// ───────────── Patterns ─────────────
// "-", "•", "1.", "1.1", "(a)", "a)" ... followed by whitespace
const BULLET =
  /^\s*(?:[-–—•·▪◦*]|\(?\d{1,3}(?:\.\d{1,3})+[.)]?|\(?\d{1,3}[.)]|\(?[a-z][.)])(?=\s|$)/i;
const CONTINUES = /[,\-–/&]$/; // line ends mid-phrase => next line is a wrap
// Symbol bullet only ("- CW630IPJ", "• Tiles"). Deliberately NOT numbers: "5.00" must never look like a marker.
const MARKER = /^\s*[-–—•·▪◦*]\s+\S/;
const LOWERCASE_START = /^[a-z]/;

// ───────────── Types ─────────────
/**
 * A cell that may not be exactly an Azure cell:
 *  - a slice of one (item split into lines)  -> `x` = left edge of its first line
 *  - part of a merged cell (rowSpan > 1, left of the item column) -> `spanId` is shared by the
 *    original and its copies; `inherited` marks the copies.
 */
export type VCell = RawCell & { x?: number; spanId?: string; inherited?: boolean };

export interface VRow {
  id: string;
  cells: VCell[];
  item?: VCell; // the cell in the item column
  x: number | null; // left edge of the item text; null = no words, so no geometry to use
}

interface VLine {
  text: string;
  x: number;
  yc: number;
  words: RawWord[];
}

const scan = <T, S>(xs: T[], init: S, step: (s: S, x: T, i: number) => S): S[] => {
  const out: S[] = [];
  xs.reduce((s, x, i) => (out[i] = step(s, x, i)), init);
  return out;
};

// ───────────── 1. Item column ─────────────
export interface ColStats {
  filled: number;
  chars: number;
  markers: number;
}

export const colStats = (texts: string[]): ColStats => {
  const ts = texts.filter(Boolean);
  return {
    filled: ts.length,
    chars: ts.reduce((n, t) => n + t.length, 0),
    markers: ts.filter((t) => MARKER.test(t)).length,
  };
};

/**
 * A column full of bullet markers IS the hierarchy column ("- CW630IPJ" under "CW630PJ").
 * Evidence must be strong (>= 2 markers AND half the column's cells) so a Remarks column with a
 * couple of stray dashes can't hijack the choice. Otherwise: most filled cells, then most text.
 */
export function pickItemIndex(cols: ColStats[]): number {
  const markerCol = cols.reduce(
    (best, c, i) =>
      c.markers >= 2 && c.markers * 2 >= c.filled && (best < 0 || c.markers > cols[best].markers)
        ? i
        : best,
    -1
  );
  if (markerCol >= 0) return markerCol;
  return cols.reduce(
    (best, c, i) =>
      c.filled > cols[best].filled || (c.filled === cols[best].filled && c.chars > cols[best].chars)
        ? i
        : best,
    0
  );
}

// ───────────── 2a. Unmerge ─────────────
// Azure reports a merged cell ONCE, on its first row. Left of the item column these are group
// labels ("10" spanning ten rows): we copy them onto every covered row so each row is complete,
// then dropInheritedCells() removes the copies a parent row already provides.
// Change `isGroupLabel` to widen or narrow which merged cells are spread.
const isGroupLabel = (c: RawCell, itemIdx: number) =>
  c.columnIndex < itemIdx && c.rowSpan > 1 && !!c.text;

function unmerge(body: RawCell[], itemIdx: number): { ri: number; cells: VCell[] }[] {
  const rowIndexes = [...new Set(body.map((c) => c.rowIndex))].sort((a, b) => a - b);
  const placed = body.flatMap((c): [number, VCell][] => {
    if (!isGroupLabel(c, itemIdx)) return [[c.rowIndex, c]];
    const origin: VCell = { ...c, spanId: `${c.rowIndex}:${c.columnIndex}` };
    const covered = rowIndexes.filter((r) => r > c.rowIndex && r < c.rowIndex + c.rowSpan);
    return [
      [c.rowIndex, origin],
      ...covered.map((r): [number, VCell] => [r, { ...origin, rowIndex: r, inherited: true }]),
    ];
  });
  const byRow = groupBy(placed, ([r]) => r);
  return rowIndexes.map((ri) => ({ ri, cells: (byRow.get(ri) ?? []).map(([, c]) => c) }));
}

// ───────────── 2b. Split ─────────────
// The cell polygon is the whole grid box (no indent information), but the WORDS inside keep their
// real x/y. We rebuild visual lines from the words and, when they are indented differently,
// split the cell into one virtual row per item.

/** Visual lines of a cell: words in reading order, grouped by y. */
function cellLines(c: RawCell, wordH: number): VLine[] {
  const words = c.words.filter((w) => w.polygon.length).sort((a, b) => a.offset - b.offset);
  const rows = words.reduce<{ words: RawWord[]; yc: number }[]>((acc, w) => {
    const yc = yCentre(w.polygon);
    const last = acc.at(-1);
    // compare with the previous word (not the line mean) so a slightly skewed scan still groups
    return last && Math.abs(yc - last.yc) <= wordH * 0.6
      ? [...acc.slice(0, -1), { words: [...last.words, w], yc }]
      : [...acc, { words: [w], yc }];
  }, []);
  return rows.map((r) => ({
    text: r.words.map((w) => w.text).join(' '),
    x: leftEdge(r.words) ?? 0,
    yc: r.yc,
    words: r.words,
  }));
}

/** Does `line` start a new item, or continue the item `current` (its lines so far)? */
function opensNewItem(line: VLine, current: VLine[], thresh: number): boolean {
  if (BULLET.test(line.text)) return true; // an explicit marker always opens an item
  const [first] = current;
  const wrapped = LOWERCASE_START.test(line.text);
  if (Math.abs(line.x - first.x) > thresh) {
    // indent/outdent opens an item, except a lowercase line under a bulleted item (hanging-indent wrap)
    const hangingWrap = line.x > first.x && wrapped && BULLET.test(first.text);
    return !hangingWrap;
  }
  // same left edge: a sibling, unless it reads like a wrapped line
  return !(wrapped || CONTINUES.test(current.at(-1)!.text));
}

/**
 * One group of lines per item, or null to keep the cell whole. Only fires when the lines are
 * indented differently from each other: a plain wrapped description has one left edge.
 */
function splitItemLines(lines: VLine[], thresh: number): VLine[][] | null {
  if (lines.length < 2) return null;
  const lefts = lines.map((l) => l.x);
  if (Math.max(...lefts) - Math.min(...lefts) <= thresh) return null;

  const groups = lines.reduce<VLine[][]>((gs, l) => {
    const current = gs.at(-1);
    return !current || opensNewItem(l, current, thresh)
      ? [...gs, [l]]
      : [...gs.slice(0, -1), [...current, l]];
  }, []);
  return groups.length > 1 ? groups : null;
}

/** A cell restricted to some of its lines; its polygon hugs the text, not the grid box. */
const sliceCell = (c: VCell, lines: VLine[], x?: number): VCell => {
  const words = lines.flatMap((l) => l.words);
  return {
    ...c,
    text: lines.map((l) => l.text).join(' '),
    words,
    polygon: unionPolygon(words.map((w) => w.polygon)),
    x,
  };
};

/** Index of the band (min/max y of an item's lines) closest to `yc`. */
const nearestBand = (bands: [number, number][], yc: number) =>
  bands.reduce(
    (best, [lo, hi], i) => {
      const d = yc < lo ? lo - yc : yc > hi ? yc - hi : 0;
      return d < best.d ? { i, d } : best;
    },
    { i: 0, d: Infinity }
  ).i;

/**
 * One grid row -> one or more virtual rows. The item cell is split by indentation; every other
 * column's lines go to the item whose vertical position they sit next to. Merged cells (and
 * cells with no geometry) have nothing to align by, so they stay on the first item.
 */
function expandRow(cells: VCell[], itemIdx: number, wordH: number, thresh: number): VCell[][] {
  const item = cells.find((c) => c.columnIndex === itemIdx);
  const groups = item && splitItemLines(cellLines(item, wordH), thresh);
  if (!item || !groups) return [cells];

  const bands = groups.map((g): [number, number] => {
    const ycs = g.map((l) => l.yc);
    return [Math.min(...ycs), Math.max(...ycs)];
  });

  const others = cells
    .filter((c) => c !== item)
    .flatMap((c): { to: number; cell: VCell }[] => {
      const lines = cellLines(c, wordH);
      if (c.spanId || !lines.length) return c.text ? [{ to: 0, cell: c }] : [];
      return groups.flatMap((_, to) => {
        const mine = lines.filter((l) => nearestBand(bands, l.yc) === to);
        return mine.length ? [{ to, cell: sliceCell(c, mine) }] : [];
      });
    });

  return groups.map((g, i) => [
    sliceCell(item, g, g[0].x),
    ...others.filter((o) => o.to === i).map((o) => o.cell),
  ]);
}

const leftX = (c: VCell): number | null =>
  c.x !== undefined && Number.isFinite(c.x) ? c.x : leftEdge(c.words);

/**
 * Body cells -> virtual rows: unmerged, split per item, empty rows removed.
 * (A row holding only merged-cell copies is empty: copies never revive a blank row.)
 */
export function toVirtualRows(
  tableId: string,
  body: RawCell[],
  itemIdx: number,
  wordH: number,
  thresh: number
): VRow[] {
  return unmerge(body, itemIdx)
    .flatMap(({ ri, cells }) =>
      expandRow(cells, itemIdx, wordH, thresh).map((vc, sub): VRow => {
        const item = vc.find((c) => c.columnIndex === itemIdx);
        return {
          id: `${tableId}_r${ri}${sub ? `.${sub}` : ''}`,
          cells: vc,
          item,
          x: item ? leftX(item) : null,
        };
      })
    )
    .filter((r) => r.cells.some((c) => c.text && !c.inherited));
}

// ───────────── 3. Levels ─────────────
export interface LevelRow {
  itemText: string;
  x: number | null; // left edge of the item text
  texts: Record<string, string>; // every cell's text by column key (outline numbering looks at all columns)
}

/** Cluster left edges: x values within `thresh` of each other share a level. */
function levelFn(xs: number[], thresh: number) {
  const centres = [...new Set(xs)]
    .sort((a, b) => a - b)
    .reduce<number[]>(
      (cs, x, i, all) => (i === 0 || x - all[i - 1] > thresh ? [...cs, x] : cs),
      []
    );
  return (x: number) => centres.reduce((lvl, c, i) => (x >= c - thresh ? i : lvl), 0);
}

/**
 * Nesting depth per row. Evidence, strongest first:
 *   1. outline numbering (1 / 1.1 / 1.1.1) - text beats pixels
 *   2. bullet markers: a bullet nests under the last row without one
 *   3. left edge of the item text (clustered)
 * A row can nest at most one level deeper than the row before it.
 */
export function assignLevels(rows: LevelRow[], columnKeys: string[], thresh: number): number[] {
  const numbered = detectNumberingLevels(
    rows.map((r) => r.texts),
    columnKeys
  );
  const toLevel = levelFn(
    rows.flatMap((r) => (r.x === null ? [] : [r.x])),
    thresh
  );
  const marked = rows.filter((r) => MARKER.test(r.itemText)).length;
  const withText = rows.filter((r) => r.itemText).length;
  const useMarkers = !numbered && marked >= 2 && marked * 2 >= withText;

  // `anchor` = level of the last row WITHOUT a bullet. -1 = none seen yet, so a bulleted list
  // with no parent row stays flat instead of making its first bullet the parent.
  const states = scan(rows, { level: -1, anchor: -1 }, (s, r, i) => {
    const isBullet = useMarkers && MARKER.test(r.itemText);
    const fromEvidence = numbered
      ? numbered.levels[i]
      : r.x === null
        ? Math.max(s.level, 0) // no geometry: stay with the previous row
        : toLevel(r.x);
    const wanted = isBullet ? Math.max(fromEvidence, s.anchor + 1) : fromEvidence;
    const level = Math.min(Math.max(0, wanted), s.level + 1);
    return { level, anchor: useMarkers && !isBullet && r.itemText ? level : s.anchor };
  });
  return states.map((s) => s.level);
}

/** Parent row index for each row (undefined = top level), derived from levels alone. */
export function parentIndexes(levels: number[]): (number | undefined)[] {
  const stack: number[] = []; // indexes of the open ancestors
  return levels.map((level, i) => {
    while (stack.length && levels[stack.at(-1)!] >= level) stack.pop();
    const parent = stack.at(-1);
    stack.push(i);
    return parent;
  });
}

// ───────────── 4. Merged-cell copies ─────────────
/**
 * A copy of a merged cell is redundant when an ancestor row already carries it: nested rows
 * inherit the value downstream (flattener). Siblings and later rows keep their copy.
 */
export function dropInheritedCells(rows: VRow[], parents: (number | undefined)[]): VRow[] {
  const visible: Set<string>[] = []; // merged cells each row can see: its own + its ancestors'
  return rows.map((r, i) => {
    const p = parents[i];
    const fromAncestors = p === undefined ? new Set<string>() : visible[p];
    const cells = r.cells.filter((c) => !(c.inherited && c.spanId && fromAncestors.has(c.spanId)));
    visible[i] = new Set([...fromAncestors, ...cells.flatMap((c) => (c.spanId ? [c.spanId] : []))]);
    return { ...r, cells };
  });
}
