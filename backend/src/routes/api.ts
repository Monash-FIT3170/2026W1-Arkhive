import express, {Request ,Response, Router } from "express"
import { extractTextFromSampleImage } from "../services/ocr/ocr";

const apiRouter = Router();

// /api/download
apiRouter.post("/txtOutput", (req, res) => {
  return res.status(204).send("image sent to be txt processed");
});

apiRouter.post("/csvOutput", (req, res) => {
  return res.status(204).send("image sent to be csv processed");
});

apiRouter.patch("/changeDataFields", (req, res) => {
  return res.status(204).send("JSON has been modified based on request");
})

// testing ocr endpoint (author: Jasper)
apiRouter.get('/ocr/test', async (_req: Request, res: Response) => {
  try {
    const text = await extractTextFromSampleImage();

    res.json({
      success: true,
      text,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: 'OCR failed',
    });
  }
});

export default apiRouter;