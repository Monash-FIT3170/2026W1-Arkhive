import { Router } from "express";
import extractionController from "../controller/extraction";

const router = Router();

router.get("/", extractionController.getExtraction);
router.post("/", extractionController.saveExtraction);

export default router;
