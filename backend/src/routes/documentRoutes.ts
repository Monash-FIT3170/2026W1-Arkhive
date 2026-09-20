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

// It takes a list of
// { documentId, pageIndices } selections spanning any number of documents,
// so a user can process pages picked from multiple files in one call.
documentsRouter.post('/process', documentsController.processDocument);

// Save is now page-scoped: one document can have some pages 'done' and
// others still pending, so the save target has to be a specific page.
documentsRouter.patch('/:id/pages/:pageIndex/data', documentsController.saveExtractedData);

documentsRouter.delete('/:id/pages/:pageIndex', documentsController.deletePage);
documentsRouter.delete('/:id', documentsController.deleteDocument);

export default documentsRouter;
