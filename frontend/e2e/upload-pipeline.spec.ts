import { test, expect } from './fixtures/test';

// Runs as a guest (decoupled from auth.spec.ts/projects.spec.ts's seeded
// user). Continues past smoke.spec.ts's stopping point (file selected,
// URL at /upload?step=preview) through to a completed OCR run and the
// validation page. Relies on OCR_MODE=mock (set in e2e/globalSetup.ts) for
// a fast, free, deterministic result instead of hitting real Azure/Gemini.

test('guest user can process an upload through to the validation page', async ({
  page,
  loginPage,
  uploadPage,
  validationPage,
}) => {
  await loginPage.goto();
  await loginPage.continueAsGuest();

  await uploadPage.selectFile('../backend/assets/sample-page-1.png');
  await expect(page).toHaveURL(/\/upload\?step=preview$/);

  await uploadPage.clickProcessAndHandleWarning();
  await expect(uploadPage.ocrProgressWindow).toBeVisible();

  await uploadPage.clickReviewResults();

  await expect(page).toHaveURL(/\/validation$/);
  await expect(validationPage.extractedDataHeading).toBeVisible();

  // Proves the mock OCR fixture's data actually flowed through, not just
  // an empty panel.
  await expect(page.getByText('$42.00')).toBeVisible();
});
