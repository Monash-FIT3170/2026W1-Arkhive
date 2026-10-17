package com.arkhive.pages;

import com.arkhive.pageobjects.ValidationPageObjects;
import com.arkhive.reporting.ReportLogger;
import org.openqa.selenium.By;
import org.openqa.selenium.Keys;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.interactions.Actions;

import java.util.List;

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
        boolean loaded = isDisplayed(timeoutSeconds);
        if (loaded) {
            ReportLogger.pass("Validation workspace loaded successfully");
        }
        return loaded;
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
        ReportLogger.info("Switched to Split view");
    }

    public void switchToDocumentView() {
        click(pageObjects.documentViewButton);
        ReportLogger.info("Switched to Document-only view");
    }

    public void switchToTableView() {
        click(pageObjects.tableViewButton);
        ReportLogger.info("Switched to Table view");
    }

    // ── View-mode switching (unambiguous title-based locators) ──────────────

    /**
     * Switches to Table-only view using the title-attribute locator.
     * In Table mode, the document panel is removed from the DOM entirely.
     */
    public void switchToTableViewMode() {
        click(pageObjects.tableViewModeButton);
        ReportLogger.info("Switched Validation workspace to Table-only view");
    }

    /**
     * Switches back to Split view using the title-attribute locator.
     */
    public void switchToSplitViewMode() {
        click(pageObjects.splitViewModeButton);
        ReportLogger.info("Switched Validation workspace to Split view");
    }

    /**
     * Returns true when the view-mode toolbar (which contains the Split/Table buttons)
     * is visible — used as a precondition before calling the switchers.
     */
    public boolean isViewModeToolbarDisplayed() {
        return isDisplayed(pageObjects.tableViewModeButton, 5);
    }

    /**
     * Returns true when the document panel is absent from the DOM.
     * Used to assert that Table-only mode has actually hidden the document panel.
     * Uses a short wait to allow for React render; returns true quickly once the
     * panel is gone, rather than blocking the full default timeout.
     */
    public boolean isDocumentPanelAbsent() {
        return waitForInvisibility(pageObjects.documentPanel, 5);
    }

    // ── Cell editing ─────────────────────────────────────────────────────────

    /**
     * Clicks the "Edit Table" toggle to enter edit mode.
     */
    public void enableEditMode() {
        click(pageObjects.editTableButton);
        ReportLogger.info("Enabled table edit mode in Validation workspace");
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
     * Clicks the first data cell to open the inline editor, then replaces its
     * content with {@code newValue} and commits the change with Enter.
     */
    public void editFirstCell(String newValue) {
        click(pageObjects.firstDataCell);
        WebElement textarea = waitForVisible(pageObjects.activeCellTextarea, 5);
        textarea.sendKeys(newValue);
        textarea.sendKeys(Keys.ENTER);
        ReportLogger.info("Edited table cell value and committed changes");
    }

    /**
     * Waits up to {@code timeoutSeconds} for the inline cell textarea to disappear,
     * which happens once the application has committed the edit and re-rendered the
     * cell in read-only mode.
     *
     * @return true if the textarea is gone within the timeout
     */
    public boolean waitForCellEditComplete(int timeoutSeconds) {
        return waitForInvisibility(pageObjects.activeCellTextarea, timeoutSeconds);
    }

    // ── Export Modal ─────────────────────────────────────────────────────────

    /**
     * Clicks the "Export" button in the Extracted Data toolbar to open the Export modal.
     */
    public void openExportModal() {
        click(pageObjects.exportButton);
        ReportLogger.info("Opened Export Data modal from Validation workspace");
    }

    /**
     * Returns true if the "Export" button is displayed in the Extracted Data toolbar.
     */
    public boolean isExportButtonDisplayed() {
        return isDisplayed(pageObjects.exportButton, 5);
    }

    // ── Multi-page Navigation ────────────────────────────────────────────────

    public boolean isPageNavigationDisplayed() {
        return isDisplayed(pageObjects.nextPageButton, 5) || isDisplayed(pageObjects.pageNavigationContainer, 5);
    }

    public void navigateToNextPage() {
        click(pageObjects.nextPageButton);
        ReportLogger.info("Navigated to next page in Validation workspace");
    }

    public void navigateToPreviousPage() {
        click(pageObjects.prevPageButton);
        ReportLogger.info("Navigated to previous page in Validation workspace");
    }

    public void switchToPage(int pageNumber) {
        By pageBtn = By.xpath("//div[contains(@class,'flex') and .//span[normalize-space()='Page']]//button[normalize-space()='" + pageNumber + "']");
        click(pageBtn);
        ReportLogger.info("Switched to page " + pageNumber + " in Validation workspace");
    }

    public String getActivePageNumber() {
        if (isDisplayed(pageObjects.activePageButton, 3)) {
            return getText(pageObjects.activePageButton);
        }
        return "1";
    }

    // ── OCR Overlays & Interaction ───────────────────────────────────────────

    public boolean hasOcrBoundingBoxes() {
        try {
            waitForPresence(pageObjects.ocrBoundingBoxes);
            List<WebElement> boxes = driver.findElements(pageObjects.ocrBoundingBoxes);
            return !boxes.isEmpty();
        } catch (Exception e) {
            return false;
        }
    }

    public void hoverFirstDataCell() {
        if (isDisplayed(pageObjects.firstDataCell, 5)) {
            Actions actions = new Actions(driver);
            actions.moveToElement(waitForVisible(pageObjects.firstDataCell, 5)).perform();
            ReportLogger.info("Hovered over first data cell to trigger OCR text highlighting");
        }
    }
}

