import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';

test('unauthenticated user is redirected to login', async ({ page }) => {
  await page.goto('http://localhost:5173');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Arkhive' })).toBeVisible();
});

test('login page accepts user input', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.fillLoginForm(
    'student@example.com',
    'password123'
  );

  await expect(loginPage.emailInput).toHaveValue('student@example.com');
  await expect(loginPage.passwordInput).toHaveValue('password123');
});