import { GoogleGenerativeAI, SchemaType, Schema } from "@google/generative-ai";
import type { Message } from "../models/message";
import dotenv from "dotenv";
import { ExtractedData } from "../models/TableData";
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
						"unclear",
						"column_confirm",
						"column_correction"
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
				},
				approved: {
					type: SchemaType.BOOLEAN,
					description:
						"True if the user confirmed the columns are correct (for column_confirm)."
				},
				updates: {
					type: SchemaType.ARRAY,
					description: "A list of column name updates (for column_correction).",
					items: {
						type: SchemaType.OBJECT,
						properties: {
							from: {
								type: SchemaType.STRING,
								description: "The current column name."
							},
							to: {
								type: SchemaType.STRING,
								description: "The new column name."
							}
						},
						required: ["from", "to"]
					}
				}
			},
			required: ["type"]
		}
	},
	required: ["response"]
};

export default {
	sendMessageToGemini: async (
		messages: Message[],
		documentContext: ExtractedData | undefined
	): Promise<string> => {
		//turn into string
		const formattedContext = JSON.stringify(documentContext, null, 2);

		//set up model
		const model = genAI.getGenerativeModel({
			model: "gemini-2.5-flash",
			systemInstruction: `You are an AI assistant helping a user validate and correct a digitized document/table. 
            Analyse the user's message. If they want to change data in a specific cell (e.g., 'change apples to bananas in row X'), extract the intent as a 'correction'.
            If they confirm the columns look correct, use the 'column_confirm' intent and set 'approved' to true.
            If they want to rename one or more column headers (e.g., 'change Supplier to Vendor Name'), use the 'column_correction' intent and populate the 'updates' array.
            If they approve or reject the document generally, use the 'approval' or 'rejection' intent.
            Always be polite and confirm what you are doing in the 'response' field.
            
            CURRENT TABLE CONTEXT:
            The following JSON represents the current state of the extracted table, including its column headers and row data. 
            Use this data to understand exactly what the user is referring to when they ask for corrections:
            
            ${formattedContext}
            `,
			generationConfig: {
				responseMimeType: "application/json",
				responseSchema: chatResponseSchema
			}
		});
		console.log(formattedContext);
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
