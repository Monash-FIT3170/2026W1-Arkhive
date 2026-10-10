import { GoogleGenAI, Type, type Schema } from '@google/genai';
import type {
  Block,
  Cell,
  Column,
  FieldBlock,
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
  minX,
  unionPolygon,
} from './layout';
import { detectNumberingLevels } from './numbering';

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

export const normalizeColKey = (s: string) =>
  s
    .replace(/\(.*?\)/g, '')
    .replace(/\./g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);

// ───────────────────────── 1. Deterministic: Azure tables → TableBlock ─────────────────────────

function toCell(c: RawCell, page: number): Cell {
  return {
    text: c.text,
    region: { page, polygon: c.polygon },
    confidence: mean(c.words.map((w) => w.confidence)),
  };
}

// No words => null, NOT the cell box: the box is grid-aligned, so every row would get
// the same x and every level would silently come out 0.
function leftX(c?: RawCell): number | null {
  if (!c || !c.words.length) return null;
  const x = Math.min(...c.words.map((w) => minX(w.polygon)));
  return Number.isFinite(x) ? x : null;
}

/** Indent levels from geometry: cluster leftmost word-x of the item column. No LLM needed. */
function levelFn(xs: number[], thresh: number) {
  const centres: number[] = [];
  let last = -Infinity;
  for (const x of [...new Set(xs)].sort((a, b) => a - b)) {
    if (x - last > thresh) centres.push(x);
    last = x;
  }
  return (x: number) => centres.reduce((lvl, c, i) => (x >= c - thresh ? i : lvl), 0);
}

/** Column with the most non-empty cells; ties broken by total text length, then leftmost. */
function pickItemIndex(cols: { filled: number; chars: number }[]): number {
  let best = 0;
  cols.forEach((c, i) => {
    const b = cols[best];
    if (c.filled > b.filled || (c.filled === b.filled && c.chars > b.chars)) best = i;
  });
  return best;
}

export function buildTable(t: RawTable, page: number): TableBlock | null {
  if (!t.cells.length) return null;

  const headerRows = new Set(t.cells.filter((c) => c.isHeader).map((c) => c.rowIndex));
  const used = new Map<string, number>();
  const columns: Column[] = Array.from({ length: t.columnCount }, (_, i) => {
    const label = t.cells
      .filter((c) => c.isHeader && c.columnIndex === i)
      .map((c) => c.text)
      .join(' ')
      .trim();
    const base = normalizeColKey(label) || `COL_${i + 1}`; // headerless tables get COL_n
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    return {
      key: n ? `${base}_${n + 1}` : base,
      label: label || `Column ${i + 1}`,
      inferred: !label,
    };
  });

  const body = t.cells.filter((c) => !headerRows.has(c.rowIndex));
  const itemIdx = pickItemIndex(
    columns.map((_, i) => {
      const cs = body.filter((c) => c.columnIndex === i && c.text);
      return { filled: cs.length, chars: cs.reduce((n, c) => n + c.text.length, 0) };
    })
  );
  const thresh =
    (median(t.cells.flatMap((c) => c.words).map((w) => height(w.polygon))) || 0.1) * 0.75;

  const byRow = new Map<number, RawCell[]>();
  body.forEach((c) => byRow.set(c.rowIndex, [...(byRow.get(c.rowIndex) ?? []), c]));
  const raw = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ri, cells]) => ({ ri, cells, x: leftX(cells.find((c) => c.columnIndex === itemIdx)) }))
    .filter((r) => r.cells.some((c) => c.text));

  const noX = raw.filter((r) => r.x === null).length;
  if (raw.length && noX / raw.length > 0.5) {
    console.warn(
      `[extractors] ${t.id}: ${noX}/${raw.length} rows had no item-cell words; geometric indent levels are unreliable`
    );
  }
  // Outline numbering (1 / 1.1 / 1.1.1) is more reliable than pixels, so it wins when present.
  const numbered = detectNumberingLevels(
    raw.map((r) => Object.fromEntries(r.cells.map((c) => [columns[c.columnIndex].key, c.text]))),
    columns.map((c) => c.key)
  );

  const toLevel = levelFn(
    raw.map((r) => r.x).filter((x): x is number => x !== null),
    thresh
  );
  const rows: TableRow[] = [];
  const stack: TableRow[] = [];
  let prev = 0;
  for (const [idx, r] of raw.entries()) {
    const level = numbered ? numbered.levels[idx] : r.x === null ? prev : toLevel(r.x);
    prev = level;
    const cells: Record<string, Cell> = {};
    r.cells.forEach((c) => {
      if (c.text) cells[columns[c.columnIndex].key] = toCell(c, page);
    });
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const row: TableRow = {
      id: `${t.id}_r${r.ri}`,
      level,
      parentId: stack[stack.length - 1]?.id,
      cells,
      confidence: Math.min(1, ...Object.values(cells).map((c) => c.confidence)),
    };
    stack.push(row);
    rows.push(row);
  }

  return {
    kind: 'table',
    id: t.id,
    region: { page, polygon: t.polygon },
    confidence: Math.min(1, ...rows.map((r) => r.confidence)),
    columns,
    itemColumnKey: columns[itemIdx].key,
    rows,
  };
}

export const nativeTableExtractor: Extractor = {
  name: 'native-tables',
  async run({ page, claimed }) {
    const out: Block[] = [];
    for (const t of page.tables) {
      const block = buildTable(t, page.pageIndex + 1);
      if (!block) continue;
      out.push(block);
      page.lines
        .filter((l) => inSpans(t.spans, l.offset, l.length))
        .forEach((l) => claimed.add(l.id));
    }
    return out;
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

const sources: Schema = { type: Type.ARRAY, items: { type: Type.STRING } };
const str = { type: Type.STRING };
const llmSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    fields: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: { key: str, label: str, value: str, sources },
        required: ['key', 'label', 'value', 'sources'],
      },
    },
    tables: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          columns: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: { key: str, label: str },
              required: ['key', 'label'],
            },
          },
          rows: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                cells: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: { column: str, text: str, sources },
                    required: ['column', 'text', 'sources'],
                  },
                },
              },
              required: ['cells'],
            },
          },
        },
        required: ['columns', 'rows'],
      },
    },
    text: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          role: {
            type: Type.STRING,
            format: 'enum',
            enum: ['title', 'heading', 'paragraph', 'footer'],
          },
          text: str,
          sources,
        },
        required: ['role', 'text', 'sources'],
      },
    },
  },
  required: ['fields', 'tables', 'text'],
};

const SYSTEM = `You convert OCR lines into structured data. Each input line is: id<TAB>left_x<TAB>text.
- Group lines into: key/value "fields" (e.g. invoice_number, date, vendor, subtotal, tax, total), "tables" (repeating item rows, even with no header or ruling lines), and "text" (everything else).
- NEVER invent or normalise text: copy values verbatim from the lines.
- Every item MUST list the ids of the lines it came from in "sources".
- A table cell that is empty is simply omitted (do not emit empty strings). Column keys must be consistent across rows. If there is no header line, name the columns yourself (e.g. description, quantity, unit_price, amount).
- Do not emit lines that are already covered elsewhere.`;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

/** Region from source ids + hallucination guard (value must appear in its sources). */
function ground(text: string, ids: string[], lines: Map<string, RawLine>, page: number) {
  const src = ids.map((i) => lines.get(i)).filter((l): l is RawLine => !!l);
  if (!src.length) return { region: undefined, confidence: 0.3 };
  const base = Math.min(...src.map((l) => l.confidence));
  const ok = norm(src.map((l) => l.text).join('')).includes(norm(text));
  return {
    region: { page, polygon: unionPolygon(src.map((l) => l.polygon)) },
    confidence: ok ? base : Math.min(base, 0.4),
  };
}

export const llmStructurer: Extractor = {
  name: 'llm-structurer',
  async run({ page, claimed, hint, ai }) {
    const todo = page.lines.filter((l) => !claimed.has(l.id));
    if (!todo.length) return [];
    const byId = new Map(todo.map((l) => [l.id, l]));
    const pageNo = page.pageIndex + 1;

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
    const parsed = JSON.parse(res.text ?? '{}');
    const out: Block[] = [];

    (parsed.fields ?? []).forEach((f: any, i: number) =>
      out.push({
        kind: 'field',
        id: `p${pageNo}_f${i}`,
        key: normalizeColKey(f.key),
        label: f.label,
        value: f.value,
        ...ground(f.value, f.sources ?? [], byId, pageNo),
      } satisfies FieldBlock)
    );

    (parsed.tables ?? []).forEach((t: any, ti: number) => {
      const columns: Column[] = t.columns.map((c: any) => ({
        key: normalizeColKey(c.key),
        label: c.label,
      }));
      const rows: TableRow[] = t.rows.map((r: any, ri: number) => {
        const cells: Record<string, Cell> = {};
        for (const c of r.cells) {
          const g = ground(c.text, c.sources ?? [], byId, pageNo);
          cells[normalizeColKey(c.column)] = { text: c.text, ...g };
        }
        return {
          id: `p${pageNo}_t${ti}_r${ri}`,
          level: 0,
          cells,
          confidence: Math.min(1, ...Object.values<Cell>(cells).map((c) => c.confidence)),
        };
      });
      if (!columns.length || !rows.length) return;

      // Item column = most filled cells (same rule as native tables), not blindly columns[0].
      const itemKey =
        columns[
          pickItemIndex(
            columns.map((c) => {
              const ts = rows.map((r) => r.cells[c.key]?.text ?? '').filter(Boolean);
              return { filled: ts.length, chars: ts.reduce((n, t) => n + t.length, 0) };
            })
          )
        ].key;

      // Levels: outline numbering first, then the left edge of each row's item text.
      const numbered = detectNumberingLevels(
        rows.map((r) => Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, c.text]))),
        columns.map((c) => c.key)
      );
      if (numbered) {
        rows.forEach((r, i) => (r.level = numbered.levels[i]));
      } else {
        const xs = rows.map((r) => minX(r.cells[itemKey]?.region?.polygon ?? []));
        const thresh = (median(todo.map((l) => height(l.polygon))) || 0.1) * 0.75;
        const toLevel = levelFn(xs.filter(Number.isFinite), thresh);
        rows.forEach((r, i) => {
          r.level = Number.isFinite(xs[i]) ? toLevel(xs[i]) : (rows[i - 1]?.level ?? 0);
        });
      }

      out.push({
        kind: 'table',
        id: `p${pageNo}_t${ti}`,
        columns,
        itemColumnKey: itemKey,
        rows,
        confidence: Math.min(...rows.map((r) => r.confidence)),
      });
    });

    (parsed.text ?? []).forEach((t: any, i: number) =>
      out.push({
        kind: 'text',
        id: `p${pageNo}_x${i}`,
        role: t.role,
        text: t.text,
        ...ground(t.text, t.sources ?? [], byId, pageNo),
      } satisfies TextBlock)
    );

    return out;
  },
};
