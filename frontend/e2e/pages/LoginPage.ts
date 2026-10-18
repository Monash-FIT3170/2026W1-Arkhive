import { type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly registerTab: Locator;
  readonly guestLink: Locator;
  readonly guestConfirmButton: Locator;
  readonly displayNameInput: Locator;
  readonly registerEmailInput: Locator;
  readonly registerPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly createAccountButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByPlaceholder('Email');
    this.passwordInput = page.getByPlaceholder('Password');
    this.signInButton = page.getByRole('button', { name: 'Sign In' });
    this.registerTab = page.getByRole('button', { name: 'Register' });
    this.guestLink = page.getByText('Continue as Guest', { exact: true });
    this.guestConfirmButton = page
    .getByRole('button', { name: 'Continue as Guest' }).last();
    this.displayNameInput = page.getByPlaceholder(
      'Display Name (first name or nickname)'
    );
    this.registerEmailInput = page.getByPlaceholder('Email');
    this.registerPasswordInput = page.getByPlaceholder('Password', {
      exact: true,
    });
    this.confirmPasswordInput = page.getByPlaceholder('Confirm Password');
    this.createAccountButton = page.getByRole('button', {
      name: 'Create Account',
});
  }

  async goto() {
    await this.page.goto('/login');
  }

  async fillLoginForm(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async signIn(email: string, password: string) {
    await this.fillLoginForm(email, password);
    await this.signInButton.click();
  }

  async openRegister() {
  await this.registerTab.click();
  }

  async continueAsGuest() {
  await this.guestLink.click();
  await this.guestConfirmButton.click();
  }

  async fillRegistrationForm(
    displayName: string,
    email: string,
    password: string,
    confirmPassword: string
  ) {
    await this.displayNameInput.fill(displayName);
    await this.registerEmailInput.fill(email);
    await this.registerPasswordInput.fill(password);
    await this.confirmPasswordInput.fill(confirmPassword);
  }
}