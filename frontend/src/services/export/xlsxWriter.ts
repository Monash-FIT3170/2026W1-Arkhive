import { buildZip, textEncode, type ZipEntry } from './zip';

/**
 * Minimal SpreadsheetML writer: multiple sheets, real numbers, a few styles,
 * auto column widths. Dependency-free (same approach as the old services).
 * Templates describe WHAT goes in cells; this file only knows HOW to write them.
 */

export type CellStyle = 'plain' | 'header' | 'bold' | 'title' | 'money';

export interface XCell {
  v: string | number | null;
  style?: CellStyle;
  /** Excel indent level for text cells (used for nested rows). */
  indent?: number;
}
export type CellInput = XCell | string | number | null;

export interface XSheet {
  name: string;
  rows: CellInput[][];
  /** Optional explicit widths (characters). Auto-sized from content when omitted. */
  colWidths?: number[];
}

// cellXfs order in STYLES_XML below
const STYLE_ID: Record<CellStyle, number> = { plain: 0, header: 1, bold: 2, title: 3, money: 4 };
const INDENT_BASE = 5; // ids 5..8 = indent 1..4

const styleId = (c: XCell): number => {
  const style = c.style ?? 'plain';
  if (style === 'plain' && c.indent && c.indent > 0) return INDENT_BASE + Math.min(c.indent, 4) - 1;
  return STYLE_ID[style];
};

// eslint-disable-next-line no-control-regex -- characters that are illegal in XML 1.0 and would corrupt the file
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(XML_INVALID, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnLetter(index: number): string {
  let letter = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

export function sanitizeSheetName(name: string, fallback: string, used: Set<string>): string {
  let base = name
    .replace(/[\\/?*:[\]]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .slice(0, 28);
  if (!base) base = fallback;

  let finalName = base;
  let counter = 1;
  while (used.has(finalName.toLowerCase())) {
    finalName = `${base.slice(0, 25)} (${counter})`;
    counter++;
  }
  used.add(finalName.toLowerCase());
  return finalName;
}

const toCell = (c: CellInput): XCell => (c !== null && typeof c === 'object' ? c : { v: c });

function cellXml(cell: XCell, ref: string): string {
  const s = styleId(cell);
  const sAttr = s ? ` s="${s}"` : '';
  if (cell.v === null || cell.v === undefined || cell.v === '') {
    return s ? `<c r="${ref}"${sAttr}/>` : '';
  }
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    return `<c r="${ref}"${sAttr}><v>${cell.v}</v></c>`;
  }
  return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.v)}</t></is></c>`;
}

function autoWidths(grid: XCell[][]): number[] {
  const w: number[] = [];
  for (const row of grid) {
    if (row.length < 2) continue; // single-cell rows are titles/headings, don't size columns from them
    row.forEach((c, i) => {
      if (c.style === 'title') return;
      const len =
        (c.v === null || c.v === undefined ? 0 : String(c.v).length) + (c.indent ?? 0) * 2;
      w[i] = Math.max(w[i] ?? 0, len);
    });
  }
  return w;
}

function sheetXml(sheet: XSheet): string {
  const grid = sheet.rows.map((r) => r.map(toCell));
  const widths =
    sheet.colWidths ?? autoWidths(grid).map((n) => Math.min(60, Math.max(8, (n ?? 0) + 2)));

  let cols = '';
  for (let i = 0; i < widths.length; i++) {
    if (widths[i] === undefined) continue;
    cols += `<col min="${i + 1}" max="${i + 1}" width="${widths[i]}" customWidth="1"/>`;
  }

  const rowsXml = grid
    .map((cells, r) => {
      const inner = cells.map((cell, ci) => cellXml(cell, `${columnLetter(ci)}${r + 1}`)).join('');
      return inner ? `<row r="${r + 1}">${inner}</row>` : '';
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowsXml}</sheetData></worksheet>`;
}

const indentXf = (n: number) =>
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" indent="${n}"/></xf>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>${[1, 2, 3, 4].map(indentXf).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Builds the raw bytes of an .xlsx workbook. Sheet names are sanitised and de-duplicated here. */
export function buildWorkbook(input: XSheet[]): Uint8Array {
  const used = new Set<string>();
  const sheets = (input.length > 0 ? input : [{ name: 'Extracted Data', rows: [] }]).map(
    (s, i) => ({ ...s, name: sanitizeSheetName(s.name, `Sheet ${i + 1}`, used), id: i + 1 })
  );

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
    .map(
      (s) =>
        `<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('')}</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${sheets
    .map((s) => `<sheet name="${escapeXml(s.name)}" sheetId="${s.id}" r:id="rId${s.id}"/>`)
    .join('')}</sheets></workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
    .map(
      (s) =>
        `<Relationship Id="rId${s.id}" Type="${REL}/worksheet" Target="worksheets/sheet${s.id}.xml"/>`
    )
    .join(
      ''
    )}<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>`;

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: textEncode(contentTypes) },
    { name: '_rels/.rels', data: textEncode(rootRels) },
    { name: 'xl/workbook.xml', data: textEncode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: textEncode(workbookRels) },
    { name: 'xl/styles.xml', data: textEncode(STYLES_XML) },
    ...sheets.map((s) => ({
      name: `xl/worksheets/sheet${s.id}.xml`,
      data: textEncode(sheetXml(s)),
    })),
  ];
  return buildZip(entries);
}
