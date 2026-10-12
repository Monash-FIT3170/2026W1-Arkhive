package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for ProjectsPage (/projects).
 */
public class ProjectsPageObjects {

    public final By pageHeading = By.xpath("//h1[normalize-space()='Projects']");
    public final By projectNameInput = By.cssSelector("input[placeholder='New project name']");
    public final By createProjectButton = By.xpath("//button[contains(.,'Create') and not(ancestor::div[contains(@class,'modal')])] ");
    public final By loadingSpinner = By.cssSelector(".loading-spinner");
    public final By emptyProjectsMessage = By.xpath("//div[contains(text(),'No projects yet')]");
    public final By projectCards = By.xpath("//div[contains(@class,'grid')]//div[contains(@class,'rounded-xl') and .//span[contains(@class,'font-medium')]]");
    public final By errorAlert = By.cssSelector(".alert.alert-error");

    // Modal locators
    public final By deleteModalTitle = By.xpath("//div[contains(@class,'modal-open')]//h3[normalize-space()='Delete Project']");
    public final By confirmDeleteButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(@class,'btn-error') and contains(text(),'Delete')]");
    public final By cancelDeleteButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(@class,'btn-ghost') and contains(text(),'Cancel')]");

    // Parameterized locators
    public By projectCardByName(String projectName) {
        return By.xpath("//div[contains(@class,'rounded-xl')][.//span[contains(@class,'font-medium') and normalize-space()='" + projectName + "']]");
    }

    public By projectOpenAreaByName(String projectName) {
        return By.xpath("//div[contains(@class,'rounded-xl')][.//span[contains(@class,'font-medium') and normalize-space()='" + projectName + "']]//div[contains(@class,'cursor-pointer')]");
    }

    public By renameButtonByName(String projectName) {
        return By.xpath("//div[contains(@class,'rounded-xl')][.//span[contains(@class,'font-medium') and normalize-space()='" + projectName + "']]//button[@title='Rename project']");
    }

    public By deleteButtonByName(String projectName) {
        return By.xpath("//div[contains(@class,'rounded-xl')][.//span[contains(@class,'font-medium') and normalize-space()='" + projectName + "']]//button[@title='Delete project']");
    }

    public final By activeRenameInput = By.xpath("//div[contains(@class,'rounded-xl')]//input[contains(@class,'input-xs')]");
    public final By saveRenameButton = By.xpath("//div[contains(@class,'rounded-xl')]//button[@title='Save name']");
    public final By cancelRenameButton = By.xpath("//div[contains(@class,'rounded-xl')]//button[@title='Cancel']");
}
