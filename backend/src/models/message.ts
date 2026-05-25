import { ExtractedData } from "./TableData";

export interface Message {
	role: "user" | "model";
	content: string;
}

export type ChatMessage = { 
	id: string; 
	role: "user" | "model"; 
	content: string; 
	timestamp: string; 
	intent?: Intent; // so MessageItem knows when to show Accept/Reject 
	resolved?: boolean; // true after user accepts or rejects
};

export interface ChatRequest {
	// for API request
	messages: Message[];
	documentContext?: ExtractedData;
}

export interface ChatResponse {
	response: string; // the AI's human readable reply
	intent: Intent | null,
	updatedContext?: ExtractedData; // AI returns the modified table data
}

export interface Intent {
	type: "correction" | "context" | "approval" | "rejection" | "unclear" | "column_confirm" | "column_correction" | "column_delete";
	rowId?: string; // The unique ID of the row
	column?: string; // <-- Changed from 'field' to 'column'
	oldValue?: string;
	newValue?: string;
	note?: string;
	updates?: Array<{ from: string; to: string }>; // for column renames
	deletedColumns?: string[]; // for column deletes
}
