import {
  cellText,
  buildExportDoc,
  docToSections,
  type ExportOptions,
  type ExportSection,
  type ExportUnit,
} from './model';
import { buildWorkbook, type XSheet } from './xlsxWriter';
import { fillWorkbook, type WorkbookSpec } from './xlsxTemplates';
import { XLSX_PROFILES } from './profiles';

/**
 * The template registry. The modal renders cards from TEMPLATES and the planner
 * looks templates up by id, so adding a template never touches either of them.
 * `render` is pure: it returns content and never triggers a download.
 */

export type ExportFormat = 'csv' | 'json' | 'txt' | 'xlsx';

export interface ExportTemplate {
  id: string; // 'csv.default', 'xlsx.invoice'
  format: ExportFormat;
  label: string;
  description?: string;
  previewSrc: string;
  extension: string;
  mime: string;
  /** Appended to the file name: `${name}_${fileSuffix}.${extension}` */
  fileSuffix: string;
  /** Fills one form per document (invoice, receipt...). */
  form?: boolean;
  defaultSelected?: boolean;
  render(unit: ExportUnit, opts: ExportOptions): string | Uint8Array;
}

export const FORMATS: { id: ExportFormat; label: string; iconSrc: string }[] = [
  { id: 'csv', label: 'CSV', iconSrc: '/export_images/csv.png' },
  { id: 'json', label: 'JSON', iconSrc: '/export_images/json.png' },
  { id: 'txt', label: 'TXT', iconSrc: '/export_images/txt.png' },
  { id: 'xlsx', label: 'XLSX', iconSrc: '/export_images/xls.png' },
];

// ───────────── CSV ─────────────

const BOM = '\uFEFF'; // lets Excel read UTF-8 correctly
const NUMERIC = /^[+-]?\d[\d,]*\.?\d*$/;

function csvCell(value: string): string {
  let raw = value;
  // Excel formula-injection guard (same behaviour as csvDownloadService), but plain numbers like -5 are left alone.
  if (/^[=+\-@\t\r]/.test(raw) && !NUMERIC.test(raw)) raw = ` ${raw}`;
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function sectionsToCsv(sections: ExportSection[], withTitles: boolean): string {
  const lines: string[] = [];
  sections.forEach((s, i) => {
    if (i > 0) lines.push('');
    if (withTitles) lines.push(`"--- ${s.title.replace(/"/g, '""')} ---"`);
    lines.push(s.columns.map(csvCell).join(','));
    for (const row of s.rows) lines.push(row.map(csvCell).join(','));
  });
  return lines.join('\n');
}

const csvDefault: ExportTemplate = {
  id: 'csv.default',
  format: 'csv',
  label: 'Default Template',
  description: 'Fields, every table and (optionally) text, stacked with titles.',
  previewSrc: '/export_images/sample1.png',
  extension: 'csv',
  mime: 'text/csv;charset=utf-8',
  fileSuffix: 'default',
  defaultSelected: true,
  render: (unit, opts) => {
    const sections = docToSections(buildExportDoc(unit, opts.include));
    return BOM + sectionsToCsv(sections, sections.length > 1);
  },
};

const csvSimple: ExportTemplate = {
  id: 'csv.simple',
  format: 'csv',
  label: 'Simple Template',
  description: 'Tables only: a header row plus rows. No titles, fields or text.',
  previewSrc: '/export_images/sample2.png',
  extension: 'csv',
  mime: 'text/csv;charset=utf-8',
  fileSuffix: 'simple',
  render: (unit, opts) => {
    const sections = docToSections(buildExportDoc(unit, opts.include)).filter(
      (s) => s.kind === 'table'
    );
    return BOM + sectionsToCsv(sections, false);
  },
};

// ───────────── JSON ─────────────

const jsonDefault: ExportTemplate = {
  id: 'json.default',
  format: 'json',
  label: 'Default Template',
  description: 'Nested: pages → fields, texts, tables (with row indent levels).',
  previewSrc: '/export_images/sample3.png',
  extension: 'json',
  mime: 'application/json;charset=utf-8',
  fileSuffix: 'default',
  render: (unit, opts) => {
    const doc = buildExportDoc(unit, opts.include);
    return JSON.stringify(
      {
        name: doc.name,
        pages: doc.pages.map((p) => ({
          page: p.label,
          fields: p.fields.map(({ key, label, value, confidence }) => ({
            key,
            label,
            value,
            confidence,
          })),
          texts: p.texts.map(({ role, text, confidence }) => ({ role, text, confidence })),
          tables: p.tables.map(({ id, data }) => ({
            id,
            columns: data.columns,
            itemColumnKey: data.itemColumnKey,
            rows: data.rows.map((row) => ({
              _indentLevel: row._indentLevel ?? 0,
              ...(row._confidence !== undefined ? { _confidence: row._confidence } : {}),
              ...Object.fromEntries(data.columns.map((c) => [c, cellText(row[c])])),
            })),
          })),
        })),
      },
      null,
      2
    );
  },
};

// ───────────── TXT ─────────────

const RULE = '-'.repeat(40);

const txtDefault: ExportTemplate = {
  id: 'txt.default',
  format: 'txt',
  label: 'Default Template',
  description: 'Readable records: "Column: value", with confidence.',
  previewSrc: '/export_images/sample1.png',
  extension: 'txt',
  mime: 'text/plain;charset=utf-8',
  fileSuffix: 'default',
  render: (unit, opts) => {
    const doc = buildExportDoc(unit, opts.include);
    const out: string[] = [];
    for (const p of doc.pages) {
      if (doc.pages.length > 1) out.push(`=== ${p.label} ===`, '');
      if (p.fields.length) {
        out.push('Fields', RULE, ...p.fields.map((f) => `${f.label || f.key}: ${f.value}`), '');
      }
      if (p.texts.length) {
        out.push('Text', RULE, ...p.texts.map((t) => `[${t.role}] ${t.text}`), '');
      }
      p.tables.forEach(({ data }, ti) => {
        if (p.tables.length > 1) out.push(`Table ${ti + 1}`, '');
        data.rows.forEach((row, i) => {
          const pad = '  '.repeat(row._indentLevel ?? 0);
          out.push(`${pad}Record ${i + 1}`, `${pad}${RULE}`);
          for (const c of data.columns)
            out.push(`${pad}${c.replace(/_/g, ' ')}: ${cellText(row[c])}`);
          if (row._confidence !== undefined)
            out.push(`${pad}Confidence: ${Math.round(row._confidence * 100)}%`);
          out.push('');
        });
      });
    }
    return out.join('\n').trim();
  },
};

// ───────────── XLSX ─────────────

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sectionsToSheets(sections: ExportSection[]): XSheet[] {
  return sections.map((s) => ({
    name: s.title,
    rows: [
      s.columns.map((v) => ({ v, style: 'header' as const })),
      ...s.rows.map((row, r) =>
        row.map((v, c) => ({ v, indent: c === s.itemColumn ? (s.indent?.[r] ?? 0) : 0 }))
      ),
    ],
  }));
}

const xlsxDefault: ExportTemplate = {
  id: 'xlsx.default',
  format: 'xlsx',
  label: 'Default Template',
  description: 'One sheet per section: Fields, each table, Text.',
  previewSrc: '/export_images/sample3.png',
  extension: 'xlsx',
  mime: XLSX_MIME,
  fileSuffix: 'default',
  render: (unit, opts) =>
    buildWorkbook(sectionsToSheets(docToSections(buildExportDoc(unit, opts.include)))),
};

export function makeXlsxTemplate(spec: WorkbookSpec): ExportTemplate {
  return {
    id: `xlsx.${spec.id}`,
    format: 'xlsx',
    label: spec.label,
    description: `Fills the ${spec.label.toLowerCase()} layout. Anything it can't place goes on "Other data".`,
    previewSrc: spec.previewSrc ?? '/export_images/sample3.png',
    extension: 'xlsx',
    mime: XLSX_MIME,
    fileSuffix: spec.id,
    form: spec.form,
    render: (unit, opts) => buildWorkbook(fillWorkbook(buildExportDoc(unit, opts.include), spec)),
  };
}

// ───────────── Registry ─────────────

export const TEMPLATES: ExportTemplate[] = [
  csvDefault,
  csvSimple,
  jsonDefault,
  txtDefault,
  xlsxDefault,
  ...XLSX_PROFILES.map(makeXlsxTemplate),
];

export const getTemplate = (id: string): ExportTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);

export const templatesByFormat = (format: ExportFormat): ExportTemplate[] =>
  TEMPLATES.filter((t) => t.format === format);
