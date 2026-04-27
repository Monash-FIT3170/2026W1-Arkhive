import type { ChatRequest, ChatResponse, Message } from "../models/Message";
import type { ExtractedData } from "../models/TableData";

export async function sendMessage(
	messages: Message[],
	documentContext?: ExtractedData
): Promise<string> {
	const response = await fetch("/api/llm/chat", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			messages,
			documentContext
		} as ChatRequest)
	});

	if (!response.ok) {
		throw new Error("Failed to send message");
	}

	const data: ChatResponse = await response.json();
	return data.response;
}
