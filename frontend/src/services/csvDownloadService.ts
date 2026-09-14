import type { ExtractedData } from "../models/TableData";

/**
 * Escapes a single CSV cell value.
 * Wraps in double-quotes if the value contains commas, quotes, or newlines.
 * Also prevents Excel formula injection by sanitizing leading =, +, -, or @.
 */
function escapeCell(value: unknown): string {
	let raw = String(value ?? "");

	// NEW: Prevent Excel from interpreting strings as formulas (CSV Injection)
	// If it starts with =, +, -, or @, prepend a single quote
	if (/^[=\-@\t\r]/.test(raw)) {
		raw = ` ${raw}`;
	}

	if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
		return `"${raw.replace(/"/g, '""')}"`;
	}
	return raw;
}

/**
 * Converts ExtractedData (columns + rows) or multiple pages into a CSV string.
 */
export function formatExtractedDataAsCSV(data: ExtractedData | ExtractedData[]): string {
	const dataArray = Array.isArray(data) ? data : [data];
	if (dataArray.length === 0) return "";

	// Stack each page's table vertically in the CSV.
	// This prevents tables with completely different structures from 
	// staggering incorrectly and creating huge empty gaps.
	const parts: string[] = [];

	dataArray.forEach((page, index) => {
		if (!page || !page.columns || !page.rows) return;

		const exportColumns = [...page.columns];
		const header = exportColumns.map(escapeCell).join(",");

		const rowLines = page.rows.map((row) => {
			const dataCells = exportColumns.map((col) => escapeCell(row[col]));
			return [...dataCells].join(",");
		});

		// Add a small title if exporting multiple pages to distinguish them
		if (dataArray.length > 1) {
			parts.push(`"--- Page ${index + 1} ---"`);
		}
		
		parts.push(header);
		parts.push(...rowLines);

		// Add a blank row between pages
		if (index < dataArray.length - 1) {
			parts.push("");
		}
	});

	return parts.join("\n");
}

/**
 * Triggers a browser download of the given CSV string.
 * @param csv      The CSV content to download.
 * @param filename The suggested filename (default: "arkhive-extracted-data.csv").
 */
export function downloadCSV(
	csv: string,
	filename = "arkhive-extracted-data.csv"
): void {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
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
 * Convenience wrapper: format + download in one call.
 */
export function exportExtractedDataAsCSV(
	data: ExtractedData | ExtractedData[],
	filename?: string
): void {
	const csv = formatExtractedDataAsCSV(data);
	downloadCSV(csv, filename);
}