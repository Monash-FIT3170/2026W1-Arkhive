import type { ExtractedData } from "../models/TableData";

/**
 * Converts ExtractedData (columns + rows) into a JSON string.
 * Each table row becomes an object keyed by the validated column headers.
 */
export function formatExtractedDataAsJSON(data: ExtractedData): string {
	const records = data.rows.map((row) => {
		const record: Record<string, unknown> = {};
		data.columns.forEach((column) => {
			record[column] = row[column] ?? "";
		});
		return record;
	});

	return JSON.stringify(records, null, 2);
}

/**
 * Triggers a browser download of the given JSON string.
 * @param json     The JSON content to download.
 * @param filename The suggested filename (default: "arkhive-extracted-data.json").
 */
export function downloadJSON(
	json: string,
	filename = "arkhive-extracted-data.json"
): void {
	const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
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
export function exportExtractedDataAsJSON(
	data: ExtractedData,
	filename?: string
): void {
	const json = formatExtractedDataAsJSON(data);
	downloadJSON(json, filename);
}
