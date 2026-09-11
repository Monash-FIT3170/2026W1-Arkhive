import { Router } from 'express';
import documentsController from '../controller/documents';
import { requireAuth } from '../middleware/auth';

const documentsRouter = Router();

// Apply auth middleware to all document routes
documentsRouter.use(requireAuth);

documentsRouter.post('/upload-url', documentsController.getUploadUrl);
documentsRouter.get('/:id/download-url', documentsController.getDownloadUrl);
documentsRouter.get('/:id/pages/:pageIndex/url', documentsController.getDownloadUrl);
documentsRouter.get('/:id', documentsController.getDocument);
documentsRouter.post('/:id/process', documentsController.processDocument);
documentsRouter.patch('/:id/data', documentsController.saveExtractedData);
documentsRouter.delete('/:id/pages/:pageIndex', documentsController.deletePage);
documentsRouter.delete('/:id', documentsController.deleteDocument);

export default documentsRouter;
