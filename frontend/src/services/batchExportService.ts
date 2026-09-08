import type { DocumentJob } from '../models/Job';
import type { ExtractedData } from '../models/TableData';
import { flatten } from '../pages/validation/components/extracted-data/flattener';

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

function buildSheetXml(data: ExtractedData): string {
  const rowsXml: string[] = [];

  const headerCells = (data.columns || [])
    .map((col, i) => {
      const ref = `${columnLetter(i)}1`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(col)}</t></is></c>`;
    })
    .join('');
  rowsXml.push(`<row r="1">${headerCells}</row>`);

  (data.rows || []).forEach((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const cells = (data.columns || [])
      .map((col, i) => {
        const ref = `${columnLetter(i)}${excelRow}`;
        const value = row[col] ?? '';
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      })
      .join('');
    rowsXml.push(`<row r="${excelRow}">${cells}</row>`);
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

function getJobExtractedData(job: DocumentJob): ExtractedData {
  if (job.extractedData && job.extractedData.columns && job.extractedData.rows) {
    return job.extractedData;
  }
  if (job.ocrData && job.ocrData.length > 0) {
    return flatten(job.ocrData);
  }
  return { columns: ['Document', 'Status'], itemColumnKey: 'Document', rows: [{ _id: '1', Document: job.fileName, Status: job.status, _cellConfidence: {} }] };
}

/**
 * Export all document jobs in the batch as a multi-sheet Excel workbook (.xlsx).
 */
export function exportBatchAsXLSX(jobs: DocumentJob[], filename = 'arkhive-batch-export.xlsx'): void {
  if (!jobs || jobs.length === 0) return;

  const usedNames = new Set<string>();
  const sheetItems = jobs.map((job, idx) => {
    const sheetName = sanitizeSheetName(job.fileName || `Doc_${idx + 1}`, idx, usedNames);
    const data = getJobExtractedData(job);
    return { sheetName, data, sheetId: idx + 1, relId: `rId${idx + 1}` };
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
    .map((s) => `<sheet name="${escapeXml(s.sheetName)}" sheetId="${s.sheetId}" r:id="${s.relId}"/>`)
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
      data: textEncode(buildSheetXml(s.data))
    }))
  ];

  const zipBytes = buildZip(entries);
  const blob = new Blob([zipBytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
  triggerDownload(blob, filename);
}

/**
 * Export all document jobs in the batch as a combined CSV file.
 */
export function exportBatchAsCSV(jobs: DocumentJob[], filename = 'arkhive-batch-export.csv'): void {
  if (!jobs || jobs.length === 0) return;

  const sections: string[] = [];

  jobs.forEach((job, index) => {
    const data = getJobExtractedData(job);
    const headerRow = `--- DOCUMENT ${index + 1}: ${job.fileName} (${job.documentType}) ---`;
    const colRow = (data.columns || []).map((col) => `"${col.replace(/"/g, '""')}"`).join(',');
    const rowLines = (data.rows || []).map((row) =>
      (data.columns || [])
        .map((col) => {
          const val = String(row[col] ?? '');
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',')
    );

    sections.push([headerRow, colRow, ...rowLines].join('\n'));
  });

  const content = sections.join('\n\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

/**
 * Export all document jobs in the batch as a structured JSON file.
 */
export function exportBatchAsJSON(jobs: DocumentJob[], filename = 'arkhive-batch-export.json'): void {
  if (!jobs || jobs.length === 0) return;

  const batchPayload = jobs.map((job) => ({
    id: job.id,
    fileName: job.fileName,
    documentType: job.documentType,
    status: job.status,
    confidence: job.confidence,
    extractedData: getJobExtractedData(job),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt
  }));

  const jsonStr = JSON.stringify(batchPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  triggerDownload(blob, filename);
}

/**
 * Export all document jobs in the batch as a plain text summary file.
 */
export function exportBatchAsTXT(jobs: DocumentJob[], filename = 'arkhive-batch-export.txt'): void {
  if (!jobs || jobs.length === 0) return;

  const sections: string[] = [];

  jobs.forEach((job, index) => {
    const data = getJobExtractedData(job);
    const banner = `========================================================\nDOCUMENT ${index + 1}: ${job.fileName}\nTYPE: ${job.documentType} | CONFIDENCE: ${Math.round((job.confidence || 0) * 100)}%\n========================================================`;
    const colHeader = (data.columns || []).join('\t');
    const rowLines = (data.rows || []).map((row) =>
      (data.columns || []).map((col) => String(row[col] ?? '')).join('\t')
    );

    sections.push([banner, colHeader, ...rowLines].join('\n'));
  });

  const content = sections.join('\n\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  triggerDownload(blob, filename);
}
