export type ChatMessage = {
	// For UI display
	id: string;
	role: "user" | "model";
	content: string;
	timestamp: string;
};

export interface ChatRequest {
	// for API request
	message: string;
	documentId?: string;
}

export interface ChatResponse {
	//API response
	assistantMessage: ChatMessage;

	intent?: {
		intent: "fix_field" | "question" | "clarification" | "general";
	};

	correction?: {
		fieldId: string;
		oldValue: any;
		newValue: any;
	};
}

export interface ChatState {
	messages: ChatMessage[];
	isLoading: boolean;
	error?: string;
}
