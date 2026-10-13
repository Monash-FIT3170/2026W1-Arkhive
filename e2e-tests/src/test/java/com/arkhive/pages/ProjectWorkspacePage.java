package com.arkhive.pages;

import com.arkhive.pageobjects.ProjectWorkspacePageObjects;
import com.arkhive.reporting.ReportLogger;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

import java.nio.file.Path;
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
        ReportLogger.info("Clicked back to Projects");
    }

    public boolean isTabsBarDisplayed() {
        return isDisplayed(pageObjects.filesTabButton, 2);
    }

    public void switchToFilesTab() {
        click(pageObjects.filesTabButton);
        ReportLogger.info("Switched to Files tab in project workspace");
    }

    public void switchToValidateTab() {
        click(pageObjects.validateTabButton);
        ReportLogger.info("Switched to Validate tab in project workspace");
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
        String fileName = Path.of(filePath).getFileName().toString();
        ReportLogger.info("Selected document for upload in project: " + fileName);
        type(pageObjects.fileInput, filePath);
    }

    public void selectAllPages() {
        if (isDisplayed(pageObjects.selectAllButton)) {
            click(pageObjects.selectAllButton);
            ReportLogger.info("Selected all pages in project workspace");
        }
    }

    public void deselectAllPages() {
        if (isDisplayed(pageObjects.deselectAllButton)) {
            click(pageObjects.deselectAllButton);
            ReportLogger.info("Deselected all pages in project workspace");
        }
    }

    public boolean isProcessButtonEnabled() {
        return isDisplayed(pageObjects.processButton, 3) && isEnabled(pageObjects.processButton);
    }

    public void clickProcess() {
        click(pageObjects.processButton);
        ReportLogger.info("Clicked Process in project workspace");
        // Handle low-quality warning modal if triggered
        if (isDisplayed(pageObjects.lowQualityModalTitle, 3)) {
            click(pageObjects.lowQualityModalConfirmButton);
            ReportLogger.info("Confirmed low quality warning dialog in project workspace");
        }
        // Handle reprocess confirmation modal if triggered
        if (isDisplayed(pageObjects.reprocessModalTitle, 3)) {
            click(pageObjects.reprocessModalConfirmButton);
            ReportLogger.info("Confirmed reprocess modal in project workspace");
        }
    }

    public boolean isValidationWorkspaceDisplayed() {
        return isDisplayed(pageObjects.validationWorkspace, 5);
    }
}
