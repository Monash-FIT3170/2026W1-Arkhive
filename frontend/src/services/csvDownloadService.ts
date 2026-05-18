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
 * Converts ExtractedData (columns + rows) into a CSV string.
 */
export function formatExtractedDataAsCSV(data: ExtractedData): string {
	const exportColumns = [...data.columns];

	const header = exportColumns.map(escapeCell).join(",");

	const rowLines = data.rows.map((row) => {
		const dataCells = data.columns.map((col) => escapeCell(row[col]));
		return [...dataCells].join(",");
	});

	return [header, ...rowLines].join("\n");
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
	data: ExtractedData,
	filename?: string
): void {
	const csv = formatExtractedDataAsCSV(data);
	downloadCSV(csv, filename);
}