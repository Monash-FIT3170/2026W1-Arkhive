import type { ExtractedData } from "./TableData";

export type ChatMessage = {
	// For UI display
	id: string;
	role: "user" | "model";
	content: string;
	timestamp: string;
};

export interface Message {
	role: "user" | "model";
	content: string;
}

export interface ChatRequest {
	// for API request
	messages: Message[];
	documentContext: ExtractedData;
}

export interface ChatResponse {
	response: string; // the AI's human readable reply
	intent: Intent | null;
}

export interface Intent {
	type: "correction" | "context" | "approval" | "rejection" | "unclear";
	rowId?: string; // The unique ID of the row
	column?: string; // <-- Changed from 'field' to 'column'
	oldValue?: string;
	newValue?: string;
	note?: string;
}
