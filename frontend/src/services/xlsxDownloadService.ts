import type { ExtractedData } from "../models/TableData";

/**
 * Dependency-free .xlsx export.
 *
 * An .xlsx file is a ZIP archive containing a handful of XML parts (the
 * OOXML SpreadsheetML format). This file builds both the ZIP container
 * and the XML parts by hand, so no npm package (xlsx, exceljs, etc.) is
 * required - avoids any third-party supply-chain / vulnerability concerns
 * for something this small.
 *
 * - First row = validated column headers (AC: "First row contains validated column headers")
 * - Each ExtractedRow becomes one Excel row (AC: "Each table row becomes one (Excel) row")
 */

// ---------------------------------------------------------------------------
// ZIP writer (store method only - no compression needed, keeps this simple
// and dependency-free; Excel opens uncompressed ZIP entries fine)
// ---------------------------------------------------------------------------

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

// Fixed DOS date/time stamp doesn't need to be accurate, ZIP readers
// just require a valid-looking value.
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
		lv.setUint32(0, 0x04034b50, true); // local file header signature
		lv.setUint16(4, 20, true); // version needed to extract
		lv.setUint16(6, 0, true); // general purpose flag
		lv.setUint16(8, 0, true); // compression method: 0 = store
		lv.setUint16(10, DOS_TIME, true);
		lv.setUint16(12, DOS_DATE, true);
		lv.setUint32(14, crc, true);
		lv.setUint32(18, data.length, true); // compressed size
		lv.setUint32(22, data.length, true); // uncompressed size
		lv.setUint16(26, nameBytes.length, true);
		lv.setUint16(28, 0, true); // extra field length
		localHeader.set(nameBytes, 30);

		localParts.push(localHeader, data);

		const centralHeader = new Uint8Array(46 + nameBytes.length);
		const cv = new DataView(centralHeader.buffer);
		cv.setUint32(0, 0x02014b50, true); // central directory header signature
		cv.setUint16(4, 20, true); // version made by
		cv.setUint16(6, 20, true); // version needed to extract
		cv.setUint16(8, 0, true); // general purpose flag
		cv.setUint16(10, 0, true); // compression method
		cv.setUint16(12, DOS_TIME, true);
		cv.setUint16(14, DOS_DATE, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, data.length, true);
		cv.setUint32(24, data.length, true);
		cv.setUint16(28, nameBytes.length, true);
		cv.setUint16(30, 0, true); // extra field length
		cv.setUint16(32, 0, true); // file comment length
		cv.setUint16(34, 0, true); // disk number start
		cv.setUint16(36, 0, true); // internal file attributes
		cv.setUint32(38, 0, true); // external file attributes
		cv.setUint32(42, offset, true); // relative offset of local header
		centralHeader.set(nameBytes, 46);

		centralParts.push(centralHeader);
		offset += localHeader.length + data.length;
	}

	const centralDirOffset = offset;
	const centralDirSize = centralParts.reduce((sum, p) => sum + p.length, 0);

	const eocd = new Uint8Array(22);
	const ev = new DataView(eocd.buffer);
	ev.setUint32(0, 0x06054b50, true); // end of central directory signature
	ev.setUint16(4, 0, true); // disk number
	ev.setUint16(6, 0, true); // disk with central directory
	ev.setUint16(8, entries.length, true); // entries on this disk
	ev.setUint16(10, entries.length, true); // total entries
	ev.setUint32(12, centralDirSize, true);
	ev.setUint32(16, centralDirOffset, true);
	ev.setUint16(20, 0, true); // comment length

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

// ---------------------------------------------------------------------------
// SpreadsheetML (OOXML) part builders
// ---------------------------------------------------------------------------

function escapeXml(value: unknown): string {
	return String(value ?? "")
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/** Converts a 0-based column index into an Excel column letter (0 -> A, 26 -> AA, ...) */
function columnLetter(index: number): string {
	let letter = "";
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
		.join("");
	rowsXml.push(`<row r="1">${headerCells}</row>`);

	data.rows.forEach((row, rowIndex) => {
		const excelRow = rowIndex + 2; // row 1 is the header
		const cells = data.columns
			.map((col, i) => {
				const ref = `${columnLetter(i)}${excelRow}`;
				const value = row[col] ?? "";
				return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
					value
				)}</t></is></c>`;
			})
			.join("");
		rowsXml.push(`<row r="${excelRow}">${cells}</row>`);
	});

	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml.join(
		""
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
		{ name: "[Content_Types].xml", data: textEncode(CONTENT_TYPES_XML) },
		{ name: "_rels/.rels", data: textEncode(ROOT_RELS_XML) },
		{ name: "xl/workbook.xml", data: textEncode(WORKBOOK_XML) },
		{
			name: "xl/_rels/workbook.xml.rels",
			data: textEncode(WORKBOOK_RELS_XML)
		},
		{
			name: "xl/worksheets/sheet1.xml",
			data: textEncode(buildSheetXml(data))
		}
	];

	return buildZip(entries);
}

/**
 * Triggers a browser download of the given .xlsx bytes.
 * @param bytes    Raw .xlsx file bytes from buildExtractedDataXlsxBytes.
 * @param filename The suggested filename (default: "arkhive-extracted-data.xlsx").
 */
export function downloadXLSX(
	bytes: Uint8Array,
	filename = "arkhive-extracted-data.xlsx"
): void {
	const blob = new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
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
export function exportExtractedDataAsXLSX(
	data: ExtractedData,
	filename?: string
): void {
	const bytes = buildExtractedDataXlsxBytes(data);
	downloadXLSX(bytes, filename);
}