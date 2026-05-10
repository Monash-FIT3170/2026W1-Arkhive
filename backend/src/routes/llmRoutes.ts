import llmController from "../controller/llm";
import { Router } from "express";
const router = Router();

router.post("/chat", llmController.chatWithModel);

export default router;
