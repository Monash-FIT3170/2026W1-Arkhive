import { Request, Response, Router } from 'express';
import { Session } from 'express-session';
import path from 'path';
import fs from 'fs';

const router = Router();

interface ExtractionSessionData {
  extraction?: {
    ocrData: any;
    createdAt: number;
    updatedAt: number;
  };
}

type SessionRequest = Request & {
  session: Session & ExtractionSessionData;
};

export const gettestData = (req: SessionRequest, res: Response) => {
  const filePath = path.join(process.cwd(), 'assets', 'ocrDataTest.json');
  res.sendFile(filePath);
};

export const gettestImagesUrls = (req: SessionRequest, res: Response) => {
  const urls = ['/api/test/testImage/0', '/api/test/testImage/1'];
  res.json(urls);
};

export const getTestImage = (req: SessionRequest, res: Response) => {
  // Parse the index (defaults to 0 if not provided or invalid)
  let index = 0;
  if (req.params.index) {
    index = parseInt(req.params.index as string, 10);
  }

  const filename = `testImage-${index}.png`;
  const filePath = path.join(process.cwd(), 'assets', filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Image file not found on disk.' });
    return;
  }

  // Stream the file directly from disk
  res.sendFile(filePath);
};

//TEST FOR BATCH DOCUMENTS
router.get('/testData', gettestData);
router.get('/testImageUrls', gettestImagesUrls);
router.get('/testImage/:index', getTestImage);

export default router;
