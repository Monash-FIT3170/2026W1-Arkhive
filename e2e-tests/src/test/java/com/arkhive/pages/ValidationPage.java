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
     * In Table mode, the document panel is removed from the DOM entirely.
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
     *
     * <p><b>Why no select-all keystroke:</b> The textarea is rendered with
     * {@code autoFocus} and its {@code onFocus} handler calls
     * {@code e.target.select()}, so the existing text is already selected when
     * the textarea appears.  Typing the replacement value immediately overwrites
     * it on all platforms without any Ctrl+A / Cmd+A.
     *
     * <p><b>Why Enter, not Tab:</b> Enter triggers {@code handleCellBlur} which
     * sets {@code editingCellId = null} and unmounts the textarea cleanly.
     * Tab also commits the current cell but immediately opens the next cell's
     * textarea, which would still satisfy {@code activeCellTextarea}, making
     * synchronization unreliable.
     */
    public void editFirstCell(String newValue) {
        click(pageObjects.firstDataCell);
        WebElement textarea = waitForVisible(pageObjects.activeCellTextarea, 5);
        textarea.sendKeys(newValue);
        textarea.sendKeys(Keys.ENTER);
    }

    /**
     * Waits up to {@code timeoutSeconds} for the inline cell textarea to disappear,
     * which happens once the application has committed the edit and re-rendered the
     * cell in read-only mode.
     *
     * <p>Call this after {@link #editFirstCell(String)} and before reading the
     * cell text to avoid asserting against a stale DOM state.
     *
     * @return true if the textarea is gone within the timeout
     */
    public boolean waitForCellEditComplete(int timeoutSeconds) {
        return waitForInvisibility(pageObjects.activeCellTextarea, timeoutSeconds);
    }
}

