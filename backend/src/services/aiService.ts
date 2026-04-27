import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import type { Message } from "../models/message";
import dotenv from "dotenv";
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const chatResponseSchema: Schema = {
	type: SchemaType.OBJECT,
	properties: {
		response: {
			type: SchemaType.STRING,
			description:
				"Your human-readable, conversational reply to the user."
		},
		intent: {
			type: SchemaType.OBJECT,
			nullable: true,
			description:
				"The structured intent extracted from the user's request. Return null if no action is needed.",
			properties: {
				type: {
					type: SchemaType.STRING,
					format: "enum",
					description: "The type of action to take.",
					enum: [
						"correction",
						"context",
						"approval",
						"rejection",
						"unclear"
					]
				},
				column: {
					type: SchemaType.STRING,
					description:
						"The specific column header from the provided document context (e.g., 'Price', 'Quantity')."
				},
				rowId: {
					type: SchemaType.STRING,
					description:
						"The unique '_id' of the exact row the user wants to modify (extracted from the provided document context)."
				},
				oldValue: {
					type: SchemaType.STRING,
					description: "The previous value or column name."
				},
				newValue: {
					type: SchemaType.STRING,
					description:
						"The new value or column name (e.g., 'banana')."
				},
				note: {
					type: SchemaType.STRING,
					description:
						"Any extra context or reasoning the user provided."
				}
			},
			required: ["type"]
		}
	},
	required: ["response"]
};

export default {
	sendMessageToGemini: async (messages: Message[]): Promise<string> => {
		const model = genAI.getGenerativeModel({
			model: "gemini-2.5-flash",
			systemInstruction: `You are an AI assistant helping a user validate and correct a digitized document/table. 
            Analyze the user's message. If they want to change data (e.g., 'change apples to bananas'), extract the intent as a 'correction'. 
            If they approve or reject the document, extract that intent. 
            Always be polite and confirm what you are doing in the 'response' field.`,
			generationConfig: {
				responseMimeType: "application/json",
				responseSchema: chatResponseSchema
			}
		});

		// Gemini uses a history array + a final user message separately
		const history = messages.slice(0, -1).map((m) => ({
			role: m.role,
			parts: [{ text: m.content }]
		}));

		console.log(history);

		const lastMessage = messages[messages.length - 1].content;

		const chat = model.startChat({ history });
		const result = await chat.sendMessage(lastMessage);
		return JSON.parse(result.response.text());
	}
};
