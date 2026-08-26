import llmController from '../controller/llm';
import { Router } from 'express';
const router = Router();

router.post('/chat', llmController.chatWithModel);
router.post('/chat/review-field', llmController.reviewField);
router.post('/chat/review-field-bulk', llmController.reviewBulk);
router.post('/chat/detect-format', llmController.detectFormat);
export default router;
