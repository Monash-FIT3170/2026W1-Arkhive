import type {
  ExtractedData,
  ExtractedField,
  ExtractedPage,
  ExtractedRow,
  ExtractedText,
} from '../../models/TableData';

/**
 * The shared export model. Every template works from an ExportDoc, never from
 * a single flat grid, so fields, texts, every table and nesting are available.
 *
 *   ExportUnit (what ends up in ONE output file)
 *     -> buildExportDoc()  (applies the "include" options, merges tables across pages)
 *     -> docToSections()   (flat rectangular blocks for CSV / default XLSX)
 */

// ───────────── Options ─────────────

export interface ExportInclude {
  /** 'active' = only the table loaded in the grid (the old behaviour). */
  tables: 'active' | 'all';
  fields: boolean;
  texts: boolean;
}
export const DEFAULT_INCLUDE: ExportInclude = { tables: 'all', fields: true, texts: false };

export interface ExportOptions {
  include: ExportInclude;
}

// ───────────── Input ─────────────

export interface ExportUnitPage {
  /** Source file name (for labels when one unit spans several files). */
  source: string;
  /** 1-based page number inside the source file. */
  pageNumber: number;
  page: ExtractedPage;
}
export interface ExportUnit {
  name: string;
  pages: ExportUnitPage[];
}

// ───────────── Model ─────────────

export interface ExportPageDoc {
  label: string;
  fields: ExtractedField[];
  texts: ExtractedText[];
  tables: { id: string; data: ExtractedData }[];
}

/** Same-shaped tables from different pages are stacked into one (continuation pages). */
export interface ExportTable {
  title: string;
  columns: string[];
  itemColumnKey: string;
  rows: ExtractedRow[];
  /** Page label per row (parallel to `rows`). */
  origins: string[];
}
export interface ExportFieldValue {
  origin: string;
  field: ExtractedField;
}
export interface ExportTextValue {
  origin: string;
  text: ExtractedText;
}

export interface ExportDoc {
  name: string;
  pages: ExportPageDoc[];
  tables: ExportTable[];
  fields: ExportFieldValue[];
  texts: ExportTextValue[];
}

export interface ExportSection {
  id: string;
  kind: 'fields' | 'table' | 'text';
  title: string;
  columns: string[];
  rows: string[][];
  /** Nesting level per row (tables only). */
  indent?: number[];
  /** Index of the column that carries the hierarchy (tables only). */
  itemColumn?: number;
}

// ───────────── Helpers ─────────────

export const cellText = (v: unknown): string => String(v ?? '');

/** "Invoice No." -> "invoiceno". Used to match template aliases to field keys / column names. */
export const normKey = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Every non-empty table on a page in document order (active table + parked others). */
export function getPageTables(
  page: ExtractedPage,
  mode: ExportInclude['tables'] = 'all'
): { id: string; data: ExtractedData }[] {
  const all = new Map<string, ExtractedData>();
  if ((page.columns?.length ?? 0) > 0) all.set(page.tableId ?? 'table', page);
  if (mode === 'all') {
    for (const t of page.otherTables ?? []) if (t.columns.length > 0) all.set(t.tableId, t);
  }
  const order = page.tableOrder ?? [];
  const ids = [
    ...order.filter((id) => all.has(id)),
    ...[...all.keys()].filter((id) => !order.includes(id)),
  ];
  return ids.map((id) => ({ id, data: all.get(id)! }));
}

export function buildExportDoc(
  unit: ExportUnit,
  include: ExportInclude = DEFAULT_INCLUDE
): ExportDoc {
  const multiSource = new Set(unit.pages.map((p) => p.source)).size > 1;

  const pages: ExportPageDoc[] = unit.pages.map((up) => ({
    label: multiSource ? `${up.source} · Page ${up.pageNumber}` : `Page ${up.pageNumber}`,
    fields: include.fields ? (up.page.fields ?? []) : [],
    texts: include.texts ? (up.page.texts ?? []) : [],
    tables: getPageTables(up.page, include.tables),
  }));

  // Merge tables with an identical column list across pages. Two tables from the
  // SAME page never merge, so genuinely separate tables stay separate.
  const tables: ExportTable[] = [];
  const signatures: string[] = [];
  for (const p of pages) {
    for (const { data } of p.tables) {
      const sig = data.columns.join('\u0001');
      let idx = signatures.findIndex((s, i) => s === sig && !tables[i].origins.includes(p.label));
      if (idx < 0) {
        idx = tables.length;
        signatures.push(sig);
        tables.push({
          title: '',
          columns: [...data.columns],
          itemColumnKey: data.itemColumnKey,
          rows: [],
          origins: [],
        });
      }
      for (const row of data.rows ?? []) {
        tables[idx].rows.push(row);
        tables[idx].origins.push(p.label);
      }
    }
  }
  tables.forEach((t, i) => (t.title = tables.length > 1 ? `Table ${i + 1}` : 'Table'));

  return {
    name: unit.name,
    pages,
    tables,
    fields: pages.flatMap((p) => p.fields.map((field) => ({ origin: p.label, field }))),
    texts: pages.flatMap((p) => p.texts.map((text) => ({ origin: p.label, text }))),
  };
}

/** Flat rectangular blocks: fields, then each table, then text. */
export function docToSections(doc: ExportDoc): ExportSection[] {
  const multi = doc.pages.length > 1;
  const sections: ExportSection[] = [];

  if (doc.fields.length > 0) {
    sections.push({
      id: 'fields',
      kind: 'fields',
      title: 'Fields',
      columns: multi ? ['Page', 'Field', 'Value'] : ['Field', 'Value'],
      rows: doc.fields.map(({ origin, field: f }) =>
        multi ? [origin, f.label || f.key, f.value] : [f.label || f.key, f.value]
      ),
    });
  }

  doc.tables.forEach((t, i) => {
    const spansPages = new Set(t.origins).size > 1;
    sections.push({
      id: `table-${i + 1}`,
      kind: 'table',
      title: t.title,
      columns: spansPages ? ['Page', ...t.columns] : t.columns,
      rows: t.rows.map((row, r) => {
        const cells = t.columns.map((c) => cellText(row[c]));
        return spansPages ? [t.origins[r], ...cells] : cells;
      }),
      indent: t.rows.map((row) => row._indentLevel ?? 0),
      itemColumn: t.columns.indexOf(t.itemColumnKey) + (spansPages ? 1 : 0),
    });
  });

  if (doc.texts.length > 0) {
    sections.push({
      id: 'text',
      kind: 'text',
      title: 'Text',
      columns: multi ? ['Page', 'Role', 'Text'] : ['Role', 'Text'],
      rows: doc.texts.map(({ origin, text: t }) =>
        multi ? [origin, t.role, t.text] : [t.role, t.text]
      ),
    });
  }
  return sections;
}
