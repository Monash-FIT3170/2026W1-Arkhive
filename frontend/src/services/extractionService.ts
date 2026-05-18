import type { ExtractedData } from "../models/TableData";
import type { OCRComponent } from "../models/OCRComponent";

export async function getExtractionSession() {
	const response = await fetch("/api/extraction", {
		method: "GET",
		credentials: "include"
	});

	if (!response.ok) {
		throw new Error("Failed to fetch extraction session");
	}

	return await response.json();
}

export async function saveExtractionSession(ocrData: ExtractedData | OCRComponent[]) {
	const response = await fetch("/api/extraction", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		credentials: "include",
		body: JSON.stringify({ ocrData })
	});

	if (!response.ok) {
		throw new Error("Failed to save extraction session");
	}

	return await response.json();
}
