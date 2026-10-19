import { type Page, type Locator } from '@playwright/test';

export class CreateProjectModal {
  readonly page: Page;
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly createButton: Locator;
  readonly cancelButton: Locator;
  readonly errorText: Locator;

  constructor(page: Page) {
    this.page = page;
    // Scoped to the modal's <form> — ProjectsPage's own empty-state CTA is
    // also named "Create Project" and stays in the DOM behind the modal, so
    // an unscoped getByRole('button', { name: 'Create Project' }) matches
    // both (only visible when the project list starts out empty, which
    // every fresh CI database does).
    const form = page.locator('form');
    this.heading = page.getByRole('heading', { name: 'Create New Project' });
    this.nameInput = page.getByLabel('Project Name');
    this.createButton = form.getByRole('button', { name: 'Create Project' });
    this.cancelButton = form.getByRole('button', { name: 'Cancel' });
    this.errorText = page.locator('p.text-error');
  }

  async create(name: string) {
    await this.heading.waitFor();
    await this.nameInput.fill(name);
    await this.createButton.click();
    await this.heading.waitFor({ state: 'hidden' });
  }
}
