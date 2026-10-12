import type { ExtractedData } from '../../models/TableData';
import { buildZip, textEncode, type ZipEntry } from './zip';

// ---------------------------------------------------------------------------
// SpreadsheetML (OOXML) part builders
// ---------------------------------------------------------------------------

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Converts a 0-based column index into an Excel column letter (0 -> A, 26 -> AA, ...) */
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

function buildSheetXml(data: ExtractedData): string {
  const rowsXml: string[] = [];

  const headerCells = data.columns
    .map((col, i) => {
      const ref = `${columnLetter(i)}1`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
        col
      )}</t></is></c>`;
    })
    .join('');
  rowsXml.push(`<row r="1">${headerCells}</row>`);

  data.rows.forEach((row, rowIndex) => {
    const excelRow = rowIndex + 2; // row 1 is the header
    const cells = data.columns
      .map((col, i) => {
        const ref = `${columnLetter(i)}${excelRow}`;
        const value = row[col] ?? '';
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
          value
        )}</t></is></c>`;
      })
      .join('');
    rowsXml.push(`<row r="${excelRow}">${cells}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml.join(
    ''
  )}</sheetData></worksheet>`;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Extracted Data" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Builds the raw .xlsx file bytes for the given ExtractedData. */
export function buildExtractedDataXlsxBytes(data: ExtractedData): Uint8Array {
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: textEncode(CONTENT_TYPES_XML) },
    { name: '_rels/.rels', data: textEncode(ROOT_RELS_XML) },
    { name: 'xl/workbook.xml', data: textEncode(WORKBOOK_XML) },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: textEncode(WORKBOOK_RELS_XML),
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      data: textEncode(buildSheetXml(data)),
    },
  ];

  return buildZip(entries);
}

/**
 * Triggers a browser download of the given .xlsx bytes.
 * @param bytes    Raw .xlsx file bytes from buildExtractedDataXlsxBytes.
 * @param filename The suggested filename (default: "arkhive-extracted-data.xlsx").
 */
export function downloadXLSX(bytes: Uint8Array, filename = 'arkhive-extracted-data.xlsx'): void {
  const blob = new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Convenience wrapper: build + download in one call.
 * Matches the exportExtractedDataAsCSV / exportExtractedDataAsTXT signature
 * used elsewhere in ExtractedDataPanel.
 */
export function exportExtractedDataAsXLSX(data: ExtractedData, filename?: string): void {
  const bytes = buildExtractedDataXlsxBytes(data);
  downloadXLSX(bytes, filename);
}

// ---------------------------------------------------------------------------
// Bulk export (US-4.9): several processed pages/documents -> ONE zip
// containing a separate .xlsx file for each of them
// ---------------------------------------------------------------------------

export type BulkExportItem = {
  /** Name of the source page/document, e.g. "invoice.png" or "receipt (page 2)". Used to name its file. */
  name: string;
  /** The (already validated / mapped) data for that page or document. */
  data: ExtractedData;
};

/** Turns a page/document name into a safe file name (no extension). */
function toSafeFileBase(name: string): string {
  const cleaned = name
    .replace(/\.(png|jpe?g|pdf|heic|heif|tiff?)$/i, '') // drop the source-file extension
    // eslint-disable-next-line no-control-regex -- intentionally stripping control characters from user-supplied file names for safety
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') // characters not allowed in file names
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 0 ? cleaned : 'document';
}

/** Adds "(2)", "(3)", ... when two items would end up with the same file name. */
function makeUniqueFileName(base: string, used: Set<string>): string {
  let candidate = `${base}.xlsx`;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} (${counter}).xlsx`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/**
 * Builds a single ZIP containing one .xlsx per item.
 * Does not modify the items passed in (AC: "does not modify or remove the original processed files").
 * Throws if nothing was selected.
 */
export function buildBulkXlsxZipBytes(items: BulkExportItem[]): Uint8Array {
  if (items.length === 0) {
    throw new Error('No pages or documents were selected for download.');
  }

  const usedNames = new Set<string>();
  const entries: ZipEntry[] = items.map((item) => ({
    name: makeUniqueFileName(toSafeFileBase(item.name), usedNames),
    data: buildExtractedDataXlsxBytes(item.data),
  }));

  return buildZip(entries);
}

/**
 * Builds and downloads the bulk ZIP.
 * Throws an Error with a user-readable message if it cannot be generated
 * (AC: "user receives an error message if the bulk download cannot be generated")
 * the caller should catch it and show it in the UI (e.g. the existing error toast).
 */
export function downloadBulkXLSX(
  items: BulkExportItem[],
  filename = 'arkhive-bulk-export.zip'
): void {
  let bytes: Uint8Array;
  try {
    bytes = buildBulkXlsxZipBytes(items);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'Unknown error.';
    throw new Error(`Bulk download could not be generated. ${reason}`);
  }

  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
