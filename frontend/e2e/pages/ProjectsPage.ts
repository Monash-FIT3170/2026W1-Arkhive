import { type Page, type Locator } from '@playwright/test';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

export class ProjectsPage {
  readonly page: Page;
  readonly newProjectButton: Locator;
  readonly listViewButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newProjectButton = page.getByRole('button', { name: 'New Project' });
    this.listViewButton = page.getByRole('button', { name: 'List view' });
  }

  async goto() {
    await this.page.goto('/projects');
  }

  async openCreateModal() {
    await this.newProjectButton.click();
  }

  // Grid view's ProjectCard is a plain <div onClick>, not a button/link
  // role — switch to list view first, where the project name is a real
  // <button>, so this stays robust to that implementation detail.
  async openProjectByName(name: string) {
    await this.listViewButton.click();
    await this.page.getByRole('button', { name, exact: true }).click();
  }

  async deleteProjectByName(name: string) {
    await this.listViewButton.click();
    // Each list-view row's outer wrapper carries the "group" utility class
    // and contains the project's name as a real <button> — scope to that
    // row so the delete click can't hit a different project's icon.
    const row = this.page.locator('.group', {
      has: this.page.getByRole('button', { name, exact: true }),
    });
    await row.getByTitle('Delete project').click();
    await new ConfirmDeleteModal(this.page).confirm();
  }

  projectNameVisible(name: string): Locator {
    return this.page.getByText(name, { exact: true });
  }
}
