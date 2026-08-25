import llmController from '../controller/llm';
import { Router } from 'express';
const router = Router();

router.post('/chat', llmController.chatWithModel);
router.post('/chat/review-field', llmController.reviewField);
export default router;
