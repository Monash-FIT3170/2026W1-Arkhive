import { type Page, type Locator } from '@playwright/test';

export class ValidationPage {
  readonly page: Page;
  readonly extractedDataHeading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.extractedDataHeading = page.getByText('EXTRACTED DATA');
  }
}
