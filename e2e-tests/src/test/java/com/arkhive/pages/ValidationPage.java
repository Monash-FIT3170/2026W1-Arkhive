package com.arkhive.pages;

import com.arkhive.pageobjects.ValidationPageObjects;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

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

    // ── View-mode switching (unambiguous title-based locators) ──────────────

    /**
     * Switches to Table-only view using the title-attribute locator.
     * Does not match the generic "Table" text that may appear in other buttons.
     */
    public void switchToTableViewMode() {
        click(pageObjects.tableViewModeButton);
    }

    /**
     * Switches back to Split view using the title-attribute locator.
     */
    public void switchToSplitViewMode() {
        click(pageObjects.splitViewModeButton);
    }

    /**
     * Returns true when the "Table" view-mode button is visible (workspace toolbar rendered).
     */
    public boolean isViewModeToolbarDisplayed() {
        return isDisplayed(pageObjects.tableViewModeButton, 5);
    }

    // ── Cell editing ─────────────────────────────────────────────────────────

    /**
     * Clicks the "Edit Table" toggle to enter edit mode.
     */
    public void enableEditMode() {
        click(pageObjects.editTableButton);
    }

    /**
     * Returns true when the edit-mode toggle reads "Done Editing" (i.e. edit mode is active).
     */
    public boolean isEditModeActive() {
        try {
            WebElement btn = waitForVisible(pageObjects.editTableButton, 5);
            return btn.getText().contains("Done Editing");
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Returns the visible text of the first data cell in the extracted data table.
     */
    public String getFirstCellText() {
        return getText(pageObjects.firstDataCell);
    }

    /**
     * Clicks the first data cell (triggering the inline textarea), clears it,
     * types {@code newValue}, then confirms with Tab (which commits the change via onBlur).
     */
    public void editFirstCell(String newValue) {
        click(pageObjects.firstDataCell);
        WebElement textarea = waitForVisible(pageObjects.activeCellTextarea, 5);
        textarea.sendKeys(Keys.chord(Keys.CONTROL, "a"), newValue);
        textarea.sendKeys(Keys.TAB);
    }
}
