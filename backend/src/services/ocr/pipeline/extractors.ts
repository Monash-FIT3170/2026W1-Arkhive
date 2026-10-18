import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type {
  Block,
  Cell,
  Column,
  FieldBlock,
  Region,
  TableBlock,
  TableRow,
  TextBlock,
} from '../../../models/Document';
import {
  type RawCell,
  type RawLine,
  type RawPage,
  type RawTable,
  height,
  inSpans,
  mean,
  median,
  minX,
  unionPolygon,
} from './layout';
import {
  type VRow,
  assignLevels,
  colStats,
  dropInheritedCells,
  parentIndexes,
  pickItemIndex,
  toVirtualRows,
} from './hierarchy';

export const MODEL = 'gemini-flash-lite-latest';

export interface ExtractContext {
  page: RawPage;
  claimed: Set<string>; // line ids already explained by an earlier extractor
  hint: string; // doc-type specific guidance for LLM extractors
  ai: GoogleGenAI;
}
/** Extension point: one extractor = one way of turning layout into Blocks. */
export interface Extractor {
  name: string;
  run(ctx: ExtractContext): Promise<Block[]>;
}

// ───────────── Shared helpers ─────────────
export const normalizeColKey = (s: string) =>
  s
    .replace(/\(.*?\)/g, '')
    .replace(/\./g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();

const minConfidence = (cs: number[]) => Math.min(1, ...cs);

/** Indent threshold: three quarters of a typical text height. */
const indentThreshold = (heights: number[]) => (median(heights) || 0.1) * 0.75;

/** Rows -> TableRows. Levels and parents come from the hierarchy stages, ids from the rows. */
function linkRows<R extends { id: string }>(
  rows: R[],
  levels: number[],
  toRow: (r: R, level: number, parentId: string | undefined) => Omit<TableRow, 'confidence'>
): TableRow[] {
  const parents = parentIndexes(levels);
  return rows.map((r, i) => {
    const row = toRow(r, levels[i], parents[i] === undefined ? undefined : rows[parents[i]!].id);
    return { ...row, confidence: minConfidence(Object.values(row.cells).map((c) => c.confidence)) };
  });
}

// ───────────────────────── 1. Deterministic: Azure tables → TableBlock ─────────────────────────

const toCell = (c: RawCell, page: number): Cell => ({
  text: c.text,
  region: { page, polygon: c.polygon },
  confidence: mean(c.words.map((w) => w.confidence)),
});

/** One column per Azure column. Header text names it; headerless columns get COL_n; duplicates get _2, _3... */
function buildColumns(t: RawTable): Column[] {
  const seen = new Map<string, number>();
  return Array.from({ length: t.columnCount }, (_, i) => {
    const label = t.cells
      .filter((c) => c.isHeader && c.columnIndex === i)
      .map((c) => c.text)
      .join(' ')
      .trim();
    const base = normalizeColKey(label) || `COL_${i + 1}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return {
      key: n ? `${base}_${n + 1}` : base,
      label: label || `Column ${i + 1}`,
      inferred: !label,
    };
  });
}

const rowTexts = (r: VRow, columns: Column[]) =>
  Object.fromEntries(
    r.cells.filter((c) => !c.inherited).map((c) => [columns[c.columnIndex].key, c.text])
  );

export function buildTable(t: RawTable, page: number): TableBlock | null {
  if (!t.cells.length) return null;

  const columns = buildColumns(t);
  const headerRows = new Set(t.cells.filter((c) => c.isHeader).map((c) => c.rowIndex));
  const body = t.cells.filter((c) => !headerRows.has(c.rowIndex));

  const itemIdx = pickItemIndex(
    columns.map((_, i) => colStats(body.filter((c) => c.columnIndex === i).map((c) => c.text)))
  );
  const wordH = median(t.cells.flatMap((c) => c.words).map((w) => height(w.polygon))) || 0.1;
  const thresh = wordH * 0.75;

  // grid rows -> one row per visual item (merged cells unmerged, packed cells split)
  const vrows = toVirtualRows(t.id, body, itemIdx, wordH, thresh);
  const noGeometry = vrows.filter((r) => r.x === null).length;
  if (vrows.length && noGeometry / vrows.length > 0.5) {
    console.warn(
      `[extractors] ${t.id}: ${noGeometry}/${vrows.length} rows had no item-cell words; geometric indent levels are unreliable`
    );
  }

  const levels = assignLevels(
    vrows.map((r) => ({ itemText: r.item?.text ?? '', x: r.x, texts: rowTexts(r, columns) })),
    columns.map((c) => c.key),
    thresh
  );
  const rows = linkRows(
    dropInheritedCells(vrows, parentIndexes(levels)),
    levels,
    (r, level, parentId) => ({
      id: r.id,
      level,
      parentId,
      cells: Object.fromEntries(
        r.cells.filter((c) => c.text).map((c) => [columns[c.columnIndex].key, toCell(c, page)])
      ),
    })
  );

  return {
    kind: 'table',
    id: t.id,
    region: { page, polygon: t.polygon },
    confidence: minConfidence(rows.map((r) => r.confidence)),
    columns,
    itemColumnKey: columns[itemIdx].key,
    rows,
  };
}

export const nativeTableExtractor: Extractor = {
  name: 'native-tables',
  async run({ page, claimed }) {
    const built = page.tables.filter((t) => t.cells.length);
    built.forEach((t) =>
      page.lines
        .filter((l) => inSpans(t.spans, l.offset, l.length))
        .forEach((l) => claimed.add(l.id))
    );
    return built.flatMap((t) => buildTable(t, page.pageIndex + 1) ?? []);
  },
};

// ───────────────────────── 2. Deterministic: leftover lines → TextBlock ─────────────────────────

export const plainTextExtractor: Extractor = {
  name: 'plain-text',
  async run({ page, claimed }) {
    return page.lines
      .filter((l) => !claimed.has(l.id))
      .map<TextBlock>((l) => ({
        kind: 'text',
        id: l.id,
        role: 'paragraph',
        text: l.text,
        confidence: l.confidence,
        region: { page: page.pageIndex + 1, polygon: l.polygon },
      }));
  },
};

// ───────────────────────── 3. LLM: semantic grouping, grounded by line ids ─────────────────────────

const str: Schema = { type: Type.STRING };
const arr = (items: Schema): Schema => ({ type: Type.ARRAY, items });
const obj = (properties: Record<string, Schema>): Schema => ({
  type: Type.OBJECT,
  properties,
  required: Object.keys(properties),
});
const sources = arr(str);

const llmSchema = obj({
  fields: arr(obj({ key: str, label: str, value: str, sources })),
  tables: arr(
    obj({
      columns: arr(obj({ key: str, label: str })),
      rows: arr(obj({ cells: arr(obj({ column: str, text: str, sources })) })),
    })
  ),
  text: arr(
    obj({
      role: {
        type: Type.STRING,
        format: 'enum',
        enum: ['title', 'heading', 'paragraph', 'footer'],
      },
      text: str,
      sources,
    })
  ),
});

interface LlmField {
  key: string;
  label: string;
  value: string;
  sources?: string[];
}
interface LlmCell {
  column: string;
  text: string;
  sources?: string[];
}
interface LlmTable {
  columns: { key: string; label: string }[];
  rows: { cells: LlmCell[] }[];
}
interface LlmText {
  role: TextBlock['role'];
  text: string;
  sources?: string[];
}
interface LlmOutput {
  fields?: LlmField[];
  tables?: LlmTable[];
  text?: LlmText[];
}

const SYSTEM = `You convert OCR lines into structured data. Each input line is: id<TAB>left_x<TAB>text.
- Group lines into: key/value "fields" (e.g. invoice_number, date, vendor, subtotal, tax, total), "tables" (repeating item rows, even with no header or ruling lines), and "text" (everything else).
- NEVER invent or normalise text: copy values verbatim from the lines.
- Every item MUST list the ids of the lines it came from in "sources".
- A table cell that is empty is simply omitted (do not emit empty strings). Column keys must be consistent across rows. If there is no header line, name the columns yourself (e.g. description, quantity, unit_price, amount).
- Indented sub-items under a parent item are their own table rows (one row per visual item line); never merge them into the parent's cell. left_x shows the indentation.
- Do not emit lines that are already covered elsewhere.`;

// Grounding: tie every LLM value back to the OCR lines it claims to come from.
type Grounded = { region?: Region; confidence: number };
type Ground = (text: string, ids?: string[]) => Grounded;

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Region from source ids + hallucination guard (value must appear in its sources). */
const grounder =
  (lines: Map<string, RawLine>, page: number): Ground =>
  (text, ids = []) => {
    const src = ids.flatMap((id) => lines.get(id) ?? []);
    if (!src.length) return { confidence: 0.3 };
    const base = Math.min(...src.map((l) => l.confidence));
    const verbatim = squash(src.map((l) => l.text).join('')).includes(squash(text));
    return {
      region: { page, polygon: unionPolygon(src.map((l) => l.polygon)) },
      confidence: verbatim ? base : Math.min(base, 0.4),
    };
  };

const fieldBlock = (f: LlmField, id: string, ground: Ground): FieldBlock => ({
  kind: 'field',
  id,
  key: normalizeColKey(f.key),
  label: f.label,
  value: f.value,
  ...ground(f.value, f.sources),
});

const textBlock = (t: LlmText, id: string, ground: Ground): TextBlock => ({
  kind: 'text',
  id,
  role: t.role,
  text: t.text,
  ...ground(t.text, t.sources),
});

/** An LLM row before levels are known: its cells, and the x of each cell's first source line. */
interface LlmRow {
  id: string;
  cells: Record<string, Cell>;
  firstX: Record<string, number>; // a union box would start at the parent, so use the FIRST line
}

function tableBlock(
  t: LlmTable,
  id: string,
  ground: Ground,
  lines: Map<string, RawLine>,
  thresh: number
): TableBlock | null {
  const columns: Column[] = t.columns.map((c) => ({ key: normalizeColKey(c.key), label: c.label }));
  const keys = columns.map((c) => c.key);

  const llmRows = t.rows.map((r, ri): LlmRow => {
    const entries = r.cells.map((c) => ({ key: normalizeColKey(c.column), c }));
    const firstLine = (c: LlmCell) => lines.get((c.sources ?? [])[0]!);
    return {
      id: `${id}_r${ri}`,
      cells: Object.fromEntries(
        entries.map(({ key, c }) => [key, { text: c.text, ...ground(c.text, c.sources) }])
      ),
      firstX: Object.fromEntries(
        entries.flatMap(({ key, c }) => {
          const l = firstLine(c);
          return l ? [[key, minX(l.polygon)]] : [];
        })
      ),
    };
  });
  if (!columns.length || !llmRows.length) return null;

  // Item column: same rule as native tables (not blindly columns[0]).
  const itemKey =
    keys[pickItemIndex(keys.map((k) => colStats(llmRows.map((r) => r.cells[k]?.text ?? ''))))];

  const levels = assignLevels(
    llmRows.map((r) => ({
      itemText: r.cells[itemKey]?.text ?? '',
      x: Number.isFinite(r.firstX[itemKey]) ? r.firstX[itemKey] : null,
      texts: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.text])),
    })),
    keys,
    thresh
  );
  const rows = linkRows(llmRows, levels, (r, level, parentId) => ({
    id: r.id,
    level,
    parentId,
    cells: r.cells,
  }));

  return {
    kind: 'table',
    id,
    columns,
    itemColumnKey: itemKey,
    rows,
    confidence: minConfidence(rows.map((r) => r.confidence)),
  };
}

export const llmStructurer: Extractor = {
  name: 'llm-structurer',
  async run({ page, claimed, hint, ai }) {
    const todo = page.lines.filter((l) => !claimed.has(l.id));
    if (!todo.length) return [];
    const pageNo = page.pageIndex + 1;
    const byId = new Map(todo.map((l) => [l.id, l]));
    const ground = grounder(byId, pageNo);
    const thresh = indentThreshold(todo.map((l) => height(l.polygon)));

    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [
        todo.map((l) => `${l.id}\t${(minX(l.polygon) || 0).toFixed(2)}\t${l.text}`).join('\n'),
      ],
      config: {
        systemInstruction: `${SYSTEM}\n${hint}`,
        responseMimeType: 'application/json',
        responseSchema: llmSchema,
      },
    });
    const parsed: LlmOutput = JSON.parse(res.text ?? '{}');

    return [
      ...(parsed.fields ?? []).map((f, i) => fieldBlock(f, `p${pageNo}_f${i}`, ground)),
      ...(parsed.tables ?? []).flatMap(
        (t, i) => tableBlock(t, `p${pageNo}_t${i}`, ground, byId, thresh) ?? []
      ),
      ...(parsed.text ?? []).map((t, i) => textBlock(t, `p${pageNo}_x${i}`, ground)),
    ];
  },
};
