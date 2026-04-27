import { ExtractedData } from "./TableData";

export interface Message {
	role: "user" | "model";
	content: string;
}

export interface ChatRequest {
	// for API request
	messages: Message[];
	documentContext?: ExtractedData;
}

export interface ChatResponse {
	response: string; // the AI's human readable reply
	intent: Intent | null;
}

export interface Intent {
	type: "correction" | "context" | "approval" | "rejection" | "unclear";
	field?: string; // what field/header they're talking about
	oldValue?: string; // what it currently says
	newValue?: string; // what it should say
	note?: string; // any extra context the user provided
}
