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
        Assert.assertFalse(validationPage.isDocumentPanelDisplayed(),
                "Document panel should be hidden after switching to Table-only view");

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
     * workspace and that the updated value is persisted in the table.
     *
     * <p>This tests the core correction workflow: users review OCR output and
     * manually fix incorrect values.  It does not assert on the original OCR
     * text (which varies per processing run); it only verifies that the value
     * displayed after editing matches what was typed.
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
        String testValue = "E2E-edited-" + System.currentTimeMillis();
        validationPage.editFirstCell(testValue);

        // After Tab commits the edit, the cell should display the updated value.
        String actualCellText = validationPage.getFirstCellText();
        Assert.assertEquals(actualCellText, testValue,
                "First data cell should display the edited value after committing the change");
    }
}
