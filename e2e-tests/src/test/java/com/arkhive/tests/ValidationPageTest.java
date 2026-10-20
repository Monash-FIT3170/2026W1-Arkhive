package com.arkhive.tests;

import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * E2E tests for the Validation workspace.
 *
 * <p>Both tests require a document to be uploaded and processed first.
 * The shared {@link #reachValidationWorkspace()} helper performs the common
 * upload → process → wait-for-workspace sequence using the existing
 * guest session, valid-sample.pdf, and the configured OCR processing timeout.
 *
 * <p>Tests are kept independent: each method calls the helper in its own
 * guest session (via {@code @BeforeMethod}) so no shared mutable state exists.
 */
public class ValidationPageTest extends BaseTest {

    @BeforeMethod
    public void setupGuestSession() {
        loginAsGuest();
    }

    /**
     * Upload valid-sample.pdf, process it, and wait until the Validation
     * workspace is fully loaded.  Returns when the workspace is ready, or
     * fails the calling test if processing does not complete in time.
     */
    private void reachValidationWorkspace() {
        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(documentPreviewPage.isDisplayed(15),
                "DocumentPreviewPage should appear after uploading a valid file");

        documentPreviewPage.clickProcess();

        int timeout = testConfig.getProcessingTimeoutSeconds();
        Assert.assertTrue(validationPage.isWorkspaceLoaded(timeout),
                "Validation workspace should load within " + timeout + " seconds");
    }

    // ── Test 1: View-mode switching ───────────────────────────────────────────

    /**
     * Verifies that the user can switch from the default Split view to Table-only
     * view and then back to Split view inside the Validation workspace.
     *
     * <p>This is a high-value workflow because the view-mode switcher is one of
     * the primary ways users navigate the workspace, and a regression here would
     * prevent users from focusing on the extracted-data table or the document.
     *
     * <p>Synchronization: {@code isDocumentPanelAbsent()} uses
     * {@code waitForInvisibility} so it returns as soon as React removes the
     * panel from the DOM, rather than blocking for the full default timeout.
     */
    @Test(description = "Verify view-mode switching between Split and Table in the Validation workspace",
          timeOut = 200000)
    public void testViewModeSwitching() {
        reachValidationWorkspace();

        // Workspace must expose the view-mode toolbar before we interact.
        Assert.assertTrue(validationPage.isViewModeToolbarDisplayed(),
                "View-mode toolbar should be visible in the Validation workspace");

        // Switch to Table-only view.
        validationPage.switchToTableViewMode();
        Assert.assertTrue(validationPage.isExtractedDataPanelDisplayed(),
                "Extracted data table should remain visible after switching to Table view");
        Assert.assertTrue(validationPage.isDocumentPanelAbsent(),
                "Document panel should be removed from the DOM after switching to Table-only view");

        // Switch back to Split view.
        validationPage.switchToSplitViewMode();
        Assert.assertTrue(validationPage.isDocumentPanelDisplayed(),
                "Document panel should be visible again after switching back to Split view");
        Assert.assertTrue(validationPage.isExtractedDataPanelDisplayed(),
                "Extracted data table should still be visible in Split view");
    }

    // ── Test 2: Inline cell editing ───────────────────────────────────────────

    /**
     * Verifies that the user can edit an extracted text value in the Validation
     * workspace and that the updated value is displayed in the table.
     *
     * <p>How the application commits an edit:
     * <ol>
     *   <li>Clicking a cell in edit mode opens an inline {@code <textarea>} with
     *       {@code autoFocus}.  The textarea's {@code onFocus} handler immediately
     *       calls {@code e.target.select()}, selecting all existing text.</li>
     *   <li>Typing a replacement value overwrites the selection — no platform-specific
     *       select-all keystroke (Ctrl+A / Cmd+A) is needed.</li>
     *   <li>Pressing Enter triggers {@code handleCellBlur}, which saves the new
     *       value to React's {@code localEdits} state, calls {@code onCellEdit}
     *       (persisting to the extraction session via the workspace's
     *       {@code onPersist} callback), and unmounts the textarea by setting
     *       {@code editingCellId = null}.</li>
     *   <li>The cell immediately re-renders showing the value from
     *       {@code localEdits[fieldId]}.</li>
     * </ol>
     *
     * <p>The test asserts the UI-level outcome (cell displays the edited value).
     * It does not independently verify backend persistence, as that would require
     * navigating away and re-loading the session — a significant increase in
     * complexity for marginal additional confidence given that the same path is
     * exercised by the unit tests for the extraction service.
     *
     * <p>Synchronization: {@code waitForCellEditComplete()} blocks until the
     * textarea is no longer present in the DOM, ensuring React has completed the
     * re-render before {@code getFirstCellText()} is called.
     */
    @Test(description = "Verify that editing an extracted cell value persists the updated text in the table",
          timeOut = 200000)
    public void testEditExtractedCellValue() {
        reachValidationWorkspace();

        // Switch to Table view so the full data table is in focus.
        validationPage.switchToTableViewMode();
        Assert.assertTrue(validationPage.isExtractedDataPanelDisplayed(),
                "Extracted data panel must be displayed before attempting cell edit");

        // Enter edit mode.
        validationPage.enableEditMode();
        Assert.assertTrue(validationPage.isEditModeActive(),
                "Edit mode should be active after clicking 'Edit Table'");

        // Edit the first cell with a deterministic test value.
        // The textarea selects all existing text on focus (autoFocus + onFocus: e.target.select()),
        // so we type the replacement value directly without a select-all keystroke.
        // Enter commits the change and unmounts the textarea.
        String testValue = "E2E-edited-" + System.currentTimeMillis();
        validationPage.editFirstCell(testValue);

        // Wait for the textarea to disappear before reading the cell text.
        Assert.assertTrue(validationPage.waitForCellEditComplete(5),
                "Inline edit textarea should be gone after pressing Enter to commit");

        // The cell should now display the edited value (served from React's localEdits state).
        String actualCellText = validationPage.getFirstCellText();
        Assert.assertEquals(actualCellText, testValue,
                "First data cell should display the edited value after committing the change");
    }
}

