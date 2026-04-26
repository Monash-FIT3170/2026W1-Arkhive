import express, { Request, Response } from 'express';
import { testOCR, textExtraction } from './src/services/ocr/ocr';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/', (_req: Request, res: Response) => {
  res.send('Hello World');
});

// testing ocr endpoint
app.get('/ocr/test', async (_req: Request, res: Response) => {
try {
    const data = await testOCR();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).send("OCR failed");
  }
});

app.listen(PORT, () => {
  console.log(`Server is running locally at ${PORT}`);
  console.log('Test OCR at http://localhost:3000/ocr/test');
});