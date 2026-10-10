import type { DocumentJob } from '../models/Job';
import type { ExtractedData, ExtractedPage } from '../models/TableData';
import { toExtractedPages, type StoredExtraction } from './extractionService';

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function textEncode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

const DOS_TIME = 0;
const DOS_DATE = 0x5821;

function buildZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = textEncode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralParts.reduce((sum, p) => sum + p.length, 0);

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  const totalSize = centralDirOffset + centralDirSize + eocd.length;
  const result = new Uint8Array(totalSize);
  let pos = 0;
  for (const part of localParts) {
    result.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    result.set(part, pos);
    pos += part.length;
  }
  result.set(eocd, pos);

  return result;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
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

function sanitizeSheetName(name: string, index: number, usedNames: Set<string>): string {
  let sanitized = name
    .replace(/[\\/?*:[\]]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 28);

  if (!sanitized) {
    sanitized = `Document ${index + 1}`;
  }

  let finalName = sanitized;
  let counter = 1;
  while (usedNames.has(finalName.toLowerCase())) {
    finalName = `${sanitized.slice(0, 25)} (${counter})`;
    counter++;
  }
  usedNames.add(finalName.toLowerCase());
  return finalName;
}

function buildSheetXml(rows: string[][]): string {
  const rowsXml = rows.map((cells, r) => {
    const excelRow = r + 1;
    const cellsXml = cells
      .map(
        (value, c) =>
          `<c r="${columnLetter(c)}${excelRow}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
      )
      .join('');
    return `<row r="${excelRow}">${cellsXml}</row>`;
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml.join('')}</sheetData></worksheet>`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

// ───────────── Job -> pages -> sections ─────────────
// A job holds one or more ExtractedPages. A page can carry several tables
// (the active one plus `otherTables`) and key/value fields, so each exporter
// works from the same list of rectangular "sections" instead of one grid.

interface Section {
  title: string;
  columns: string[];
  rows: string[][];
}

const cellText = (v: unknown): string => String(v ?? '');

/** Edited pages (job.extractedData) win over raw OCR (job.ocrData); either may be the old or new shape. */
function getJobPages(job: DocumentJob): ExtractedPage[] {
  const hasContent = (pages: ExtractedPage[]) =>
    pages.some((p) => p.columns.length > 0 || (p.fields?.length ?? 0) > 0);

  for (const stored of [job.extractedData, job.ocrData] as unknown as (
    StoredExtraction | undefined
  )[]) {
    const pages = toExtractedPages(stored);
    if (hasContent(pages)) return pages;
  }
  return [
    {
      pageIndex: 0,
      columns: ['Document', 'Status'],
      itemColumnKey: 'Document',
      rows: [{ _id: '1', Document: job.fileName, Status: job.status, _cellConfidence: {} }],
    },
  ];
}

/** Every non-empty table on a page, in document order (active table + parked others). */
function getPageTables(page: ExtractedPage): { id: string; data: ExtractedData }[] {
  const all = new Map<string, ExtractedData>();
  if (page.columns.length > 0) all.set(page.tableId ?? 'table', page);
  for (const t of page.otherTables ?? []) if (t.columns.length > 0) all.set(t.tableId, t);

  const order = page.tableOrder ?? [];
  const ids = [
    ...order.filter((id) => all.has(id)),
    ...[...all.keys()].filter((id) => !order.includes(id)),
  ];
  return ids.map((id) => ({ id, data: all.get(id)! }));
}

function getJobSections(job: DocumentJob): Section[] {
  const sections: Section[] = [];
  for (const page of getJobPages(job)) {
    const label = `Page ${page.pageIndex + 1}`;
    if (page.fields?.length) {
      sections.push({
        title: `${label}: Fields`,
        columns: ['Field', 'Value'],
        rows: page.fields.map((f) => [f.label || f.key, f.value]),
      });
    }
    const tables = getPageTables(page);
    tables.forEach(({ data }, i) =>
      sections.push({
        title: tables.length > 1 ? `${label}: Table ${i + 1}` : `${label}: Table`,
        columns: data.columns,
        rows: data.rows.map((row) => data.columns.map((col) => cellText(row[col]))),
      })
    );
  }
  return sections;
}

/** Sections stacked with a blank row between. Titles only appear when there is more than one. */
function getJobRows(job: DocumentJob): string[][] {
  const sections = getJobSections(job);
  const titled = sections.length > 1;
  const rows: string[][] = [];
  sections.forEach((s, i) => {
    if (i > 0) rows.push([]);
    if (titled) rows.push([s.title]);
    rows.push(s.columns, ...s.rows);
  });
  return rows;
}

/**
 * Export all document jobs in the batch as a multi-sheet Excel workbook (.xlsx).
 */
export function exportBatchAsXLSX(
  jobs: DocumentJob[],
  filename = 'arkhive-batch-export.xlsx'
): void {
  if (!jobs || jobs.length === 0) return;

  const usedNames = new Set<string>();
  const sheetItems = jobs.map((job, idx) => {
    const sheetName = sanitizeSheetName(job.fileName || `Doc_${idx + 1}`, idx, usedNames);
    const rows = getJobRows(job);
    return { sheetName, rows, sheetId: idx + 1, relId: `rId${idx + 1}` };
  });

  const contentTypesOverrides = sheetItems
    .map(
      (s) =>
        `<Override PartName="/xl/worksheets/sheet${s.sheetId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${contentTypesOverrides}
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookSheetsXml = sheetItems
    .map(
      (s) => `<sheet name="${escapeXml(s.sheetName)}" sheetId="${s.sheetId}" r:id="${s.relId}"/>`
    )
    .join('');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheetsXml}</sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetItems
    .map(
      (s) =>
        `<Relationship Id="${s.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.sheetId}.xml"/>`
    )
    .join('')}
</Relationships>`;

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: textEncode(contentTypesXml) },
    { name: '_rels/.rels', data: textEncode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: textEncode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: textEncode(workbookRelsXml) },
    ...sheetItems.map((s) => ({
      name: `xl/worksheets/sheet${s.sheetId}.xml`,
      data: textEncode(buildSheetXml(s.rows)),
    })),
  ];

  const zipBytes = buildZip(entries);
  const blob = new Blob([zipBytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, filename);
}

/**
 * Export all document jobs in the batch as a combined CSV file.
 */
export function exportBatchAsCSV(jobs: DocumentJob[], filename = 'arkhive-batch-export.csv'): void {
  if (!jobs || jobs.length === 0) return;

  const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const sections = jobs.map((job, index) =>
    [
      `--- DOCUMENT ${index + 1}: ${job.fileName} ---`,
      ...getJobRows(job).map((row) => row.map(quote).join(',')),
    ].join('\n')
  );

  const blob = new Blob([sections.join('\n\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * Export all document jobs in the batch as a structured JSON file.
 * Each job lists its pages; each page lists its tables (with row indent levels),
 * fields and text blocks.
 */
export function exportBatchAsJSON(
  jobs: DocumentJob[],
  filename = 'arkhive-batch-export.json'
): void {
  if (!jobs || jobs.length === 0) return;

  const batchPayload = jobs.map((job) => ({
    id: job.id,
    fileName: job.fileName,
    status: job.status,
    confidence: job.confidence,
    pages: getJobPages(job).map((page) => ({
      pageIndex: page.pageIndex,
      fields: page.fields ?? [],
      texts: page.texts ?? [],
      tables: getPageTables(page).map(({ id, data }) => ({
        id,
        columns: data.columns,
        itemColumnKey: data.itemColumnKey,
        rows: data.rows.map((row) => ({
          _indentLevel: row._indentLevel ?? 0,
          ...Object.fromEntries(data.columns.map((col) => [col, cellText(row[col])])),
        })),
      })),
    })),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }));

  const blob = new Blob([JSON.stringify(batchPayload, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename);
}

/**
 * Export all document jobs in the batch as a plain text summary file.
 */
export function exportBatchAsTXT(jobs: DocumentJob[], filename = 'arkhive-batch-export.txt'): void {
  if (!jobs || jobs.length === 0) return;

  const sections = jobs.map((job, index) => {
    const banner = `========================================================\nDOCUMENT ${index + 1}: ${job.fileName}\nCONFIDENCE: ${Math.round((job.confidence || 0) * 100)}%\n========================================================`;
    return [banner, ...getJobRows(job).map((row) => row.join('\t'))].join('\n');
  });

  const blob = new Blob([sections.join('\n\n')], { type: 'text/plain;charset=utf-8;' });
  triggerDownload(blob, filename);
}
