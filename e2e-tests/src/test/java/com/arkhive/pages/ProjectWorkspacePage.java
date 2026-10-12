package com.arkhive.pages;

import com.arkhive.pageobjects.ProjectWorkspacePageObjects;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

import java.util.List;

/**
 * Page Object representing the Project Workspace page (/projects/:id).
 */
public class ProjectWorkspacePage extends BasePage {

    private final ProjectWorkspacePageObjects pageObjects;

    public ProjectWorkspacePage(WebDriver driver) {
        super(driver);
        this.pageObjects = new ProjectWorkspacePageObjects();
    }

    public boolean isDisplayed() {
        return waitForUrlContains("/projects/") && !isDisplayed(pageObjects.loadingSpinner);
    }

    public boolean isDisplayed(int timeoutSeconds) {
        if (!waitForUrlContains("/projects/", timeoutSeconds)) {
            return false;
        }
        waitForInvisibility(pageObjects.loadingSpinner, timeoutSeconds);
        return isDisplayed(pageObjects.backToProjectsButton, timeoutSeconds)
                || isDisplayed(pageObjects.projectNameBreadcrumb, timeoutSeconds);
    }

    public String getProjectName() {
        return getText(pageObjects.projectNameBreadcrumb);
    }

    public void clickBackToProjects() {
        click(pageObjects.backToProjectsButton);
    }

    public void switchToFilesTab() {
        click(pageObjects.filesTabButton);
    }

    public void switchToValidateTab() {
        click(pageObjects.validateTabButton);
    }

    public boolean isFilesTabActive() {
        try {
            WebElement btn = waitForVisible(pageObjects.filesTabButton);
            String className = btn.getDomAttribute("class");
            return className != null && className.contains("btn-active");
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isValidateTabActive() {
        try {
            WebElement btn = waitForVisible(pageObjects.validateTabButton);
            String className = btn.getDomAttribute("class");
            return className != null && className.contains("btn-active");
        } catch (Exception e) {
            return false;
        }
    }

    public int getDisplayedDocumentCount() {
        try {
            List<WebElement> cards = driver.findElements(pageObjects.previewCards);
            return cards.size();
        } catch (Exception e) {
            return 0;
        }
    }

    public boolean hasDocumentCards() {
        return getDisplayedDocumentCount() > 0;
    }

    public void uploadFile(String filePath) {
        type(pageObjects.fileInput, filePath);
    }

    public void selectAllPages() {
        if (isDisplayed(pageObjects.selectAllButton)) {
            click(pageObjects.selectAllButton);
        }
    }

    public void deselectAllPages() {
        if (isDisplayed(pageObjects.deselectAllButton)) {
            click(pageObjects.deselectAllButton);
        }
    }

    public boolean isProcessButtonEnabled() {
        return isDisplayed(pageObjects.processButton, 3) && isEnabled(pageObjects.processButton);
    }

    public void clickProcess() {
        click(pageObjects.processButton);
        // Handle low-quality warning modal if triggered
        if (isDisplayed(pageObjects.lowQualityModalTitle, 3)) {
            click(pageObjects.lowQualityModalConfirmButton);
        }
        // Handle reprocess confirmation modal if triggered
        if (isDisplayed(pageObjects.reprocessModalTitle, 3)) {
            click(pageObjects.reprocessModalConfirmButton);
        }
    }

    public boolean isValidationWorkspaceDisplayed() {
        return isDisplayed(pageObjects.validationWorkspace, 5);
    }
}
