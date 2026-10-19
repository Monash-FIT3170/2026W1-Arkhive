import { test, expect } from './fixtures/test';

// Runs in the "authenticated" Playwright project (see playwright.config.ts),
// which reuses the storageState produced by fixtures/auth.setup.ts — so
// every test here starts already logged in as the seeded E2E test user.

test.describe('project workflow', () => {
  let projectName: string;

  test.beforeEach(() => {
    // Unique per run so repeated/parallel executions don't collide.
    projectName = `E2E Project ${Date.now()}`;
  });

  test.afterEach(async ({ projectsPage }) => {
    await projectsPage.goto();
    await projectsPage.deleteProjectByName(projectName);
    await expect(projectsPage.projectNameVisible(projectName)).toHaveCount(0);
  });

  test('user can create a project', async ({ projectsPage, createProjectModal }) => {
    await projectsPage.goto();
    await projectsPage.openCreateModal();
    await createProjectModal.create(projectName);

    await expect(projectsPage.projectNameVisible(projectName)).toBeVisible();
  });

  test('user can open a newly created project and land on its workspace', async ({
    page,
    projectsPage,
    createProjectModal,
    projectWorkspacePage,
  }) => {
    await projectsPage.goto();
    await projectsPage.openCreateModal();
    await createProjectModal.create(projectName);

    await projectsPage.openProjectByName(projectName);

    await expect(page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(projectWorkspacePage.breadcrumbFor(projectName)).toBeVisible();

    // Brand-new project has zero documents, so EmptyUploadView renders
    // rather than a validation table.
    await expect(projectWorkspacePage.emptyStateHeading).toBeVisible();
  });
});
