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
    this.heading = page.getByRole('heading', { name: 'Create New Project' });
    this.nameInput = page.getByLabel('Project Name');
    this.createButton = page.getByRole('button', { name: 'Create Project' });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
    this.errorText = page.locator('p.text-error');
  }

  async create(name: string) {
    await this.heading.waitFor();
    await this.nameInput.fill(name);
    await this.createButton.click();
    await this.heading.waitFor({ state: 'hidden' });
  }
}
