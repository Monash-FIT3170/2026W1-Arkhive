import { ChatRequest, Message } from "../models/message";
import { Router, Request, Response } from "express";

import aiService from "../services/aiService";

export default {
	chatWithModel: async (req: Request<{}, {}, ChatRequest>, res: Response) => {
		try {
			const { messages, documentContext } = req.body;

			if (!messages || messages.length === 0) {
				res.status(400).json({ error: "No messages provided" });
				return;
			}

			const reply = await aiService.sendMessageToGemini(messages);
			console.log(reply);
			res.json({ reply });
		} catch (error) {
			console.error("Error communicating with Gemini:", error);
			res.status(500).json({
				response: "Sorry, I encountered an error on the server.",
				intent: null
			});
		}
	}
};
