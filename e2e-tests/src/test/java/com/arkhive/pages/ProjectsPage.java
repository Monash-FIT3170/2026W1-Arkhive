package com.arkhive.pages;

import com.arkhive.pageobjects.ProjectsPageObjects;
import com.arkhive.reporting.ReportLogger;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

import java.util.List;

/**
 * Page Object representing the Projects management page (/projects).
 */
public class ProjectsPage extends BasePage {

    private final ProjectsPageObjects pageObjects;

    public ProjectsPage(WebDriver driver) {
        super(driver);
        this.pageObjects = new ProjectsPageObjects();
    }

    public void open(String baseUrl) {
        String target = baseUrl.endsWith("/projects") ? baseUrl : baseUrl + "/projects";
        driver.get(target);
        ReportLogger.info("Opened Projects page");
    }

    public boolean isDisplayed() {
        return isDisplayed(pageObjects.pageHeading);
    }

    public boolean isDisplayed(int timeoutSeconds) {
        return isDisplayed(pageObjects.pageHeading, timeoutSeconds);
    }

    public void enterProjectName(String projectName) {
        clearAndType(pageObjects.projectNameInput, projectName);
    }

    public boolean isCreateButtonEnabled() {
        return isEnabled(pageObjects.createProjectButton);
    }

    public void createNewProject(String projectName) {
        ReportLogger.info("Creating new project: " + projectName);
        waitForInvisibility(pageObjects.loadingSpinner, 5);
        enterProjectName(projectName);
        click(pageObjects.createProjectButton);
        // Wait until created project card appears or loading finishes
        waitForVisible(pageObjects.projectCardByName(projectName), 10);
        ReportLogger.pass("Project created successfully: " + projectName);
    }

    public int getProjectCount() {
        waitForInvisibility(pageObjects.loadingSpinner, 5);
        try {
            List<WebElement> cards = driver.findElements(pageObjects.projectCards);
            return cards.size();
        } catch (Exception e) {
            return 0;
        }
    }

    public boolean hasProject(String projectName) {
        waitForInvisibility(pageObjects.loadingSpinner, 5);
        return isDisplayed(pageObjects.projectCardByName(projectName), 5);
    }

    public void openProject(String projectName) {
        click(pageObjects.projectOpenAreaByName(projectName));
        ReportLogger.info("Opened project: " + projectName);
    }

    public void renameProject(String currentName, String newName) {
        ReportLogger.info("Renaming project from '" + currentName + "' to '" + newName + "'");
        click(pageObjects.renameButtonByName(currentName));
        waitForVisible(pageObjects.activeRenameInput, 5);
        clearAndType(pageObjects.activeRenameInput, newName);
        click(pageObjects.saveRenameButton);
        waitForVisible(pageObjects.projectCardByName(newName), 10);
        ReportLogger.pass("Renamed project successfully to: " + newName);
    }

    public void deleteProject(String projectName) {
        ReportLogger.info("Deleting project: " + projectName);
        click(pageObjects.deleteButtonByName(projectName));
        waitForVisible(pageObjects.deleteModalTitle, 5);
        click(pageObjects.confirmDeleteButton);
        waitForInvisibility(pageObjects.deleteModalTitle, 5);
        waitForInvisibility(pageObjects.projectCardByName(projectName), 10);
        ReportLogger.pass("Deleted project successfully: " + projectName);
    }

    public void cancelDeleteProject(String projectName) {
        click(pageObjects.deleteButtonByName(projectName));
        waitForVisible(pageObjects.deleteModalTitle, 5);
        click(pageObjects.cancelDeleteButton);
        waitForInvisibility(pageObjects.deleteModalTitle, 5);
        ReportLogger.info("Cancelled deletion for project: " + projectName);
    }

    public boolean hasErrorMessage() {
        return isDisplayed(pageObjects.errorAlert);
    }

    public String getErrorMessage() {
        return getText(pageObjects.errorAlert);
    }
}
