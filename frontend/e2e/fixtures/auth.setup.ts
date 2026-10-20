import { test as setup } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AUTH_STORAGE_STATE } from '../constants';

// Logs in once as the seeded E2E test user (see backend/scripts/seedE2eUser.ts)
// and saves the session to disk, so auth-dependent specs (projects.spec.ts)
// can reuse it via the "authenticated" Playwright project instead of
// re-running the login UI flow in every test.
setup('authenticate as the seeded E2E test user', async ({ page }) => {
  const email = process.env.E2E_TEST_USER_EMAIL;
  const password = process.env.E2E_TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E_TEST_USER_EMAIL / E2E_TEST_USER_PASSWORD must be set to run authenticated E2E specs.'
    );
  }

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.signIn(email, password);
  await page.waitForURL('/');

  await page.context().storageState({ path: AUTH_STORAGE_STATE });
});
