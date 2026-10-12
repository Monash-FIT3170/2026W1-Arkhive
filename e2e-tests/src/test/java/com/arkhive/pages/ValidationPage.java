package com.arkhive.pages;

import com.arkhive.pageobjects.ValidationPageObjects;
import org.openqa.selenium.WebDriver;

/**
 * Page Object representing Step 2: Validation Page (/validation)
 */
public class ValidationPage extends BasePage {

    private final ValidationPageObjects pageObjects;

    public ValidationPage(WebDriver driver) {
        super(driver);
        this.pageObjects = new ValidationPageObjects();
    }

    public boolean isDisplayed() {
        return waitForUrlContains("/validation") && !isDisplayed(pageObjects.loadingIndicator);
    }

    public boolean isDisplayed(int timeoutSeconds) {
        if (!waitForUrlContains("/validation", timeoutSeconds)) {
            return false;
        }
        waitForInvisibility(pageObjects.loadingIndicator, timeoutSeconds);
        return isDisplayed(pageObjects.extractedDataViewer, timeoutSeconds)
                || isDisplayed(pageObjects.viewModeGroup, timeoutSeconds)
                || isDisplayed(pageObjects.documentViewer, timeoutSeconds);
    }

    public boolean isWorkspaceLoaded(int timeoutSeconds) {
        return isDisplayed(timeoutSeconds);
    }

    public boolean isDocumentPanelDisplayed() {
        return isDisplayed(pageObjects.documentViewer, 5);
    }

    public boolean isExtractedDataPanelDisplayed() {
        return isDisplayed(pageObjects.extractedDataViewer, 5);
    }

    public boolean isConfidenceBadgeDisplayed() {
        return isDisplayed(pageObjects.confidenceBadge, 5);
    }

    public void switchToSplitView() {
        click(pageObjects.splitViewButton);
    }

    public void switchToDocumentView() {
        click(pageObjects.documentViewButton);
    }

    public void switchToTableView() {
        click(pageObjects.tableViewButton);
    }
}
