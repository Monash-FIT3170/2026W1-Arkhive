import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { CreateProjectModal } from '../pages/CreateProjectModal';
import { ConfirmDeleteModal } from '../pages/ConfirmDeleteModal';
import { ProjectWorkspacePage } from '../pages/ProjectWorkspacePage';
import { UploadPage } from '../pages/UploadPage';
import { ValidationPage } from '../pages/ValidationPage';

type Fixtures = {
  loginPage: LoginPage;
  projectsPage: ProjectsPage;
  createProjectModal: CreateProjectModal;
  confirmDeleteModal: ConfirmDeleteModal;
  projectWorkspacePage: ProjectWorkspacePage;
  uploadPage: UploadPage;
  validationPage: ValidationPage;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, provide) => {
    const loginPage = new LoginPage(page);

    await provide(loginPage);
  },

  projectsPage: async ({ page }, provide) => {
    await provide(new ProjectsPage(page));
  },

  createProjectModal: async ({ page }, provide) => {
    await provide(new CreateProjectModal(page));
  },

  confirmDeleteModal: async ({ page }, provide) => {
    await provide(new ConfirmDeleteModal(page));
  },

  projectWorkspacePage: async ({ page }, provide) => {
    await provide(new ProjectWorkspacePage(page));
  },

  uploadPage: async ({ page }, provide) => {
    await provide(new UploadPage(page));
  },

  validationPage: async ({ page }, provide) => {
    await provide(new ValidationPage(page));
  },
});

export { expect };
