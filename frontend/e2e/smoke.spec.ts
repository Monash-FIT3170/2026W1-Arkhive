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

test('empty login submission shows email required error', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.signInButton.click();

  await expect(page.getByText('Email is required.')).toBeVisible();
});

test('register tab shows registration form', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.openRegister();

  await expect(page.getByRole('button', { name: 'Register' })).toBeVisible();
});

test('user can continue as guest to upload page', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.continueAsGuest();

  await expect(page).toHaveURL(/\/upload$/);
  await expect(page.getByText('Guest Mode', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Select Files' })
  ).toBeVisible();
});

test('guest user can select a valid image for upload', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.continueAsGuest();

  const fileInput = page.locator('input[type="file"]');

  await fileInput.setInputFiles('../backend/assets/sample-page-1.png');

  await expect(page).toHaveURL(/\/upload\?step=preview$/);
});

test('unsupported file type is not accepted for upload', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto();
  await loginPage.continueAsGuest();

  const fileInput = page.locator('input[type="file"]');

  await fileInput.setInputFiles('e2e/fixtures/invalid-test.csv');

  await expect(page).toHaveURL(/\/upload$/);
});