import type { ExtractedData } from "../models/TableData";

/**
 * Converts ExtractedData (columns + rows) into a human-readable TXT string.
 * Each row is rendered as "Column: value" pairs, separated by a divider,
 * with the confidence score included when available.
 */
export function formatExtractedDataAsTXT(data: ExtractedData): string {
    const lines: string[] = [];

    data.rows.forEach((row, index) => {
        lines.push(`Record ${index + 1}`);
        lines.push("-".repeat(40));

        data.columns.forEach((column) => {
            const label = column.replace(/_/g, " ");
            const value = row[column] ?? "";
            lines.push(`${label}: ${value}`);
        });

        if (row._confidence !== undefined) {
            const percent = Math.round(row._confidence * 100);
            lines.push(`Confidence: ${percent}%`);
        }

        lines.push(""); // blank line between records
    });

    return lines.join("\n").trim();
}

/**
 * Triggers a browser download of the given TXT string.
 * @param txt      The TXT content to download.
 * @param filename The suggested filename (default: "arkhive-extracted-data.txt").
 */
export function downloadTXT(
    txt: string,
    filename = "arkhive-extracted-data.txt"
): void {
    const blob = new Blob([txt], { type: "text/plain;charset=utf-8;" });
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
export function exportExtractedDataAsTXT(
    data: ExtractedData,
    filename?: string
): void {
    const txt = formatExtractedDataAsTXT(data);
    downloadTXT(txt, filename);
}