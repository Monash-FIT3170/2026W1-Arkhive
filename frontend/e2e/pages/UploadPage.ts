import { type Page, type Locator } from '@playwright/test';

export class UploadPage {
  readonly page: Page;
  readonly fileInput: Locator;
  readonly processButton: Locator;
  readonly lowQualityWarningHeading: Locator;
  readonly processAnywayButton: Locator;
  readonly ocrProgressWindow: Locator;
  readonly reviewResultsButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.fileInput = page.locator('input[type="file"]');
    this.processButton = page.getByRole('button', { name: /^Process/ });
    this.lowQualityWarningHeading = page.getByText('Warning: Low Quality Images');
    this.processAnywayButton = page.getByRole('button', { name: 'Yes, process anyway' });
    this.ocrProgressWindow = page.getByTestId('ocr-progress-window');
    this.reviewResultsButton = page.getByRole('button', { name: 'Review results' });
  }

  // The page kicks off a background POST to /api/upload/page as soon as a
  // file is selected (not awaited by the UI), which OCR processing later
  // reads off disk. Wait for it to finish, or clicking Process can race
  // ahead of the file actually landing on the backend.
  async selectFile(path: string) {
    const uploadResponse = this.page.waitForResponse(
      (res) => res.url().includes('/api/upload/page') && res.request().method() === 'POST'
    );
    await this.fileInput.setInputFiles(path);
    await uploadResponse;
  }

  // Uploaded pages are selected by default, so Process is immediately
  // clickable. Defensively handles the low-quality-image confirm modal,
  // which only appears for flagged (blurry/dark/invalid-size) pages.
  async clickProcessAndHandleWarning() {
    await this.processButton.click();
    if (await this.lowQualityWarningHeading.isVisible().catch(() => false)) {
      await this.processAnywayButton.click();
    }
  }

  // OCR runs via a single streamed request; with OCR_MODE=mock this
  // resolves quickly but not instantly, so allow a generous timeout.
  async clickReviewResults() {
    await this.reviewResultsButton.waitFor({ timeout: 15000 });
    await this.reviewResultsButton.click();
  }
}
