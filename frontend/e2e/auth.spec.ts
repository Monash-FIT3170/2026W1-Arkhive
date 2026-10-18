import { test, expect } from './fixtures/test';

const E2E_TEST_USER_EMAIL = process.env.E2E_TEST_USER_EMAIL!;
const E2E_TEST_USER_PASSWORD = process.env.E2E_TEST_USER_PASSWORD!;

test.describe('successful login', () => {
  test('user can log in with real credentials and reaches the authenticated app', async ({
    page,
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.signIn(E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD);

    await expect(page).toHaveURL('/');

    // The "Projects" nav tab only renders for a real authenticated user
    // (guests explicitly don't get it) — a reliable signal that this is a
    // real login, not guest mode.
    await expect(page.getByRole('button', { name: 'Projects', exact: true })).toBeVisible();
  });

  test('a logged-in user can reach /projects without being bounced to /login', async ({
    page,
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.signIn(E2E_TEST_USER_EMAIL, E2E_TEST_USER_PASSWORD);
    await expect(page).toHaveURL('/');

    await page.getByRole('button', { name: 'Projects', exact: true }).click();

    await expect(page).toHaveURL('/projects');
  });
});
