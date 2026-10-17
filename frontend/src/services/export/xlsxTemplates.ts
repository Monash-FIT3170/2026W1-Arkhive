import {
  cellText,
  normKey,
  type ExportDoc,
  type ExportFieldValue,
  type ExportTable,
  type ExportTextValue,
} from './model';
import type { CellInput, XCell, XSheet } from './xlsxWriter';
import type { ExtractedText } from '../../models/TableData';

/**
 * Data-driven XLSX templates.
 *
 * A template is a WorkbookSpec: sheets made of blocks. Blocks say which fields
 * and table columns go where, using ALIAS lists, so "Invoice No" can match a
 * field called invoice_number, invoice_no or "Invoice #". To add a new form,
 * write a spec in profiles.ts. No rendering code needed.
 *
 * Nothing is dropped: whatever a spec doesn't claim lands on an "Other data" sheet.
 */

export type CellFormat = 'text' | 'number' | 'money';

export interface FieldRef {
  /** Label written in the template. */
  label: string;
  /** Accepted field keys / labels, best match first. */
  keys: string[];
  format?: CellFormat;
}
export interface ColumnRef {
  /** Header written in the template. */
  header: string;
  /** Accepted extracted column names. */
  from: string[];
  format?: CellFormat;
}

export type BlockSpec =
  | { kind: 'title'; text: string }
  /** Fixed label | value rows. Missing fields leave the value cell empty so the layout never shifts. */
  | { kind: 'fields'; heading?: string; fields: FieldRef[] }
  /** Picks the extracted table that matches the most columns. */
  | { kind: 'table'; heading?: string; columns: ColumnRef[]; keepExtraColumns?: boolean }
  /** Every field no earlier block claimed. */
  | { kind: 'remainingFields'; heading?: string }
  /** Every table no earlier block claimed. */
  | { kind: 'remainingTables' }
  | { kind: 'texts'; heading?: string; roles?: ExtractedText['role'][] };

export interface SheetSpec {
  name: string;
  blocks: BlockSpec[];
}

export interface WorkbookSpec {
  id: string; // 'invoice' -> template id 'xlsx.invoice', file suffix '_invoice'
  label: string;
  previewSrc?: string;
  /** Form-like: fills ONE form per document. The modal hints to use "per document". */
  form?: boolean;
  sheets: SheetSpec[];
  /** Name of the sheet for unclaimed data, or false to omit it. Default 'Other data'. */
  overflowSheet?: string | false;
}

// ───────────── Number parsing ─────────────

/** "$1,234.50" / "(12.00)" / "1.234,50" / "-3" -> number. Returns null for anything that isn't clearly numeric. */
export function parseNumber(raw: string): number | null {
  const stripped = raw
    .trim()
    .replace(/[$€£¥₹]|\b[A-Za-z]{3}\b/g, '')
    .trim();
  if (!stripped || !/^\(?\s*[+-]?\s*[\d.,\s]+-?\s*\)?$/.test(stripped) || !/\d/.test(stripped))
    return null;

  let neg = /^\(.*\)$/.test(stripped) || stripped.includes('-');
  let s = stripped.replace(/[\s()+-]/g, '');

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0) {
    const single = s.indexOf(',') === lastComma;
    s = single && /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.split(',').join('');
  } else if (lastDot >= 0 && s.indexOf('.') !== lastDot) {
    s = s.split('.').join('');
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  neg = neg && n !== 0;
  return neg ? -n : n;
}

function valueCell(raw: unknown, format: CellFormat = 'text', indent = 0): XCell {
  const text = cellText(raw);
  if (format !== 'text') {
    const n = parseNumber(text);
    if (n !== null) return { v: n, style: format === 'money' ? 'money' : 'plain' };
  }
  return { v: text, indent };
}

// ───────────── Filling ─────────────

interface Used {
  fields: Set<ExportFieldValue>;
  tables: Set<ExportTable>;
  texts: Set<ExportTextValue>;
}

function findField(doc: ExportDoc, aliases: string[], used: Used): ExportFieldValue | undefined {
  for (const alias of aliases.map(normKey)) {
    const hit = doc.fields.find(
      (f) =>
        !used.fields.has(f) && (normKey(f.field.key) === alias || normKey(f.field.label) === alias)
    );
    if (hit) return hit;
  }
  return undefined;
}

function findColumn(table: ExportTable, ref: ColumnRef): string | undefined {
  const wanted = [...ref.from, ref.header].map(normKey);
  return table.columns.find((c) => wanted.includes(normKey(c)));
}

function pickTable(doc: ExportDoc, columns: ColumnRef[], used: Used): ExportTable | undefined {
  let best: ExportTable | undefined;
  let bestScore = 0;
  for (const t of doc.tables) {
    if (used.tables.has(t)) continue;
    const score = columns.filter((c) => findColumn(t, c)).length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

const headerRow = (labels: string[]): CellInput[] =>
  labels.map((v) => ({ v, style: 'header' as const }));
const headingRow = (text?: string): CellInput[][] => (text ? [[{ v: text, style: 'bold' }]] : []);

function renderBlock(doc: ExportDoc, block: BlockSpec, used: Used): CellInput[][] {
  const multi = doc.pages.length > 1;

  switch (block.kind) {
    case 'title':
      return [[{ v: block.text, style: 'title' }]];

    case 'fields': {
      const rows: CellInput[][] = [...headingRow(block.heading)];
      for (const ref of block.fields) {
        const hit = findField(doc, ref.keys, used);
        if (hit) used.fields.add(hit);
        rows.push([{ v: ref.label, style: 'bold' }, valueCell(hit?.field.value ?? '', ref.format)]);
      }
      return rows;
    }

    case 'table': {
      const table = pickTable(doc, block.columns, used);
      const rows: CellInput[][] = [...headingRow(block.heading)];
      if (!table) return [...rows, headerRow(block.columns.map((c) => c.header))];
      used.tables.add(table);

      const mapped = block.columns.map((ref) => ({ ref, col: findColumn(table, ref) }));
      const claimed = new Set(mapped.map((m) => m.col).filter(Boolean));
      const extras =
        block.keepExtraColumns === false ? [] : table.columns.filter((c) => !claimed.has(c));

      rows.push(headerRow([...block.columns.map((c) => c.header), ...extras]));
      for (const row of table.rows) {
        const indent = row._indentLevel ?? 0;
        rows.push([
          ...mapped.map(({ ref, col }) =>
            col
              ? valueCell(row[col], ref.format, col === table.itemColumnKey ? indent : 0)
              : ({ v: '' } as XCell)
          ),
          ...extras.map((col) =>
            valueCell(row[col], 'text', col === table.itemColumnKey ? indent : 0)
          ),
        ]);
      }
      return rows;
    }

    case 'remainingFields': {
      const left = doc.fields.filter((f) => !used.fields.has(f));
      if (left.length === 0) return [];
      left.forEach((f) => used.fields.add(f));
      return [
        ...headingRow(block.heading),
        headerRow(multi ? ['Field', 'Value', 'Page'] : ['Field', 'Value']),
        ...left.map(({ origin, field: f }) => {
          const row: CellInput[] = [f.label || f.key, f.value];
          if (multi) row.push(origin);
          return row;
        }),
      ];
    }

    case 'remainingTables': {
      const rows: CellInput[][] = [];
      for (const t of doc.tables) {
        if (used.tables.has(t)) continue;
        used.tables.add(t);
        if (rows.length) rows.push([]);
        rows.push([{ v: t.title, style: 'bold' }], headerRow(t.columns));
        for (const row of t.rows) {
          rows.push(
            t.columns.map((c) =>
              valueCell(row[c], 'text', c === t.itemColumnKey ? (row._indentLevel ?? 0) : 0)
            )
          );
        }
      }
      return rows;
    }

    case 'texts': {
      const left = doc.texts.filter(
        (t) => !used.texts.has(t) && (!block.roles || block.roles.includes(t.text.role))
      );
      if (left.length === 0) return [];
      left.forEach((t) => used.texts.add(t));
      return [
        ...headingRow(block.heading),
        headerRow(['Role', 'Text']),
        ...left.map(({ text: t }) => [t.role, t.text] as CellInput[]),
      ];
    }
  }
}

function renderBlocks(doc: ExportDoc, blocks: BlockSpec[], used: Used): CellInput[][] {
  const out: CellInput[][] = [];
  for (const block of blocks) {
    const part = renderBlock(doc, block, used);
    if (part.length === 0) continue;
    if (out.length > 0) out.push([]);
    out.push(...part);
  }
  return out;
}

/** Fills a WorkbookSpec with the document's data. Pure: returns sheet data for buildWorkbook(). */
export function fillWorkbook(doc: ExportDoc, spec: WorkbookSpec): XSheet[] {
  const used: Used = { fields: new Set(), tables: new Set(), texts: new Set() };
  const sheets: XSheet[] = spec.sheets.map((s) => ({
    name: s.name,
    rows: renderBlocks(doc, s.blocks, used),
  }));

  if (spec.overflowSheet !== false) {
    const rows = renderBlocks(
      doc,
      [
        { kind: 'remainingFields', heading: 'Fields not in this template' },
        { kind: 'remainingTables' },
        { kind: 'texts', heading: 'Text' },
      ],
      used
    );
    if (rows.length > 0) sheets.push({ name: spec.overflowSheet || 'Other data', rows });
  }
  return sheets;
}
