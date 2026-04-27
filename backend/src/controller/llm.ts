import { ChatRequest, Message } from "../models/message";
import { Router, Request, Response } from "express";

const aiService = require("../services/aiService");

module.exports = {
	chatWithModel: async (req: Request<{}, {}, ChatRequest>, res: Response) => {
		try {
			const { messages, documentContext } = req.body;

			if (!messages || messages.length === 0) {
				res.status(400).json({ error: "No messages provided" });
				return;
			}

			const reply = await aiService.sendMessageToGemini(messages);
			res.json({ reply });
		} catch (error) {
			console.error("Gemini error:", error);
			res.status(500).json({ error: "Failed to get AI response" });
		}
	}
};
