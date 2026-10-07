import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly registerTab: Locator;
  readonly guestLink: Locator;
  readonly guestConfirmButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByPlaceholder('Email');
    this.passwordInput = page.getByPlaceholder('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign In' });
    this.registerTab = page.getByRole('button', { name: 'Register' });
    this.guestLink = page.getByText('Continue as Guest', { exact: true });
    this.guestConfirmButton = page
    .getByRole('button', { name: 'Continue as Guest' }).last();
  }

  async goto() {
    await this.page.goto('http://localhost:5173/login');
  }

  async fillLoginForm(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async openRegister() {
  await this.registerTab.click();
  }

  async continueAsGuest() {
  await this.guestLink.click();
  await this.guestConfirmButton.click();
  }
}