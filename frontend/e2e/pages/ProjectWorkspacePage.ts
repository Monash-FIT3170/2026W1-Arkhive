import { type Page, type Locator } from '@playwright/test';

export class ProjectWorkspacePage {
  readonly page: Page;
  readonly projectsBreadcrumbButton: Locator;
  readonly emptyStateHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.projectsBreadcrumbButton = page.getByRole('button', { name: 'Projects' });
    this.emptyStateHeading = page.getByRole('heading', { name: 'ARKHIVE' });
  }

  breadcrumbFor(projectName: string): Locator {
    return this.page.getByText(projectName, { exact: true });
  }
}
