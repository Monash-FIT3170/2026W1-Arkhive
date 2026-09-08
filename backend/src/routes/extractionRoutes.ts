import { Router } from 'express';
import extractionController from '../controller/extraction';

const router = Router();

router.get('/', extractionController.getExtraction);
router.post('/', extractionController.saveExtraction);
router.get('/jobs', extractionController.getJobs);
router.post('/active', extractionController.setActiveJob);

export default router;
