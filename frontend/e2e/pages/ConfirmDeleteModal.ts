import { type Page, type Locator } from '@playwright/test';

// Generic page object for the reusable ConfirmDeleteModal component
// (used for project deletion today; the component itself has no knowledge
// of projects specifically).
export class ConfirmDeleteModal {
  readonly page: Page;
  readonly confirmButton: Locator;
  readonly cancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.confirmButton = page.getByRole('button', { name: 'Delete', exact: true });
    this.cancelButton = page.getByRole('button', { name: 'Cancel' });
  }

  async confirm() {
    await this.confirmButton.click();
  }
}
