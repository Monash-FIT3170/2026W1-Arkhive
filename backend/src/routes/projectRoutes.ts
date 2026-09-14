import { Router } from 'express';
import projectsController from '../controller/projects';
import { requireAuth } from '../middleware/auth';

const projectsRouter = Router();

// Apply auth middleware to all project routes
projectsRouter.use(requireAuth);

projectsRouter.post('/', projectsController.createProject);
projectsRouter.get('/', projectsController.listProjects);
projectsRouter.get('/:id', projectsController.getProject);
projectsRouter.patch('/:id', projectsController.updateProject);
projectsRouter.delete('/:id', projectsController.deleteProject);

export default projectsRouter;
