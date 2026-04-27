import { Router, Request, Response } from "express";
import { sendMessageToGemini, Message } from "../services/aiServce";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
    try {
        const { messages }: { messages: Message[] } = req.body;

        if (!messages || messages.length === 0) {
            res.status(400).json({ error: "No messages provided" });
            return;
        }

        const reply = await sendMessageToGemini(messages);
        res.json({ reply });
    } catch (error) {
        console.error("Gemini error:", error);
        res.status(500).json({ error: "Failed to get AI response" });
    }
});

export default router;