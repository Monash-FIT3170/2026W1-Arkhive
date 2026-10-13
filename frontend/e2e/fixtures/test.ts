import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

type Fixtures = {
  loginPage: LoginPage;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, provide) => {
    const loginPage = new LoginPage(page);

    await provide(loginPage);
  },
});

export { expect };