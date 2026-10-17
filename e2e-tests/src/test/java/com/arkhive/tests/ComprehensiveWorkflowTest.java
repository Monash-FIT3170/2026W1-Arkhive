package com.arkhive.tests;

import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Comprehensive End-to-End Test for the Arkhive application.
 *
 * <p>Executes a full document lifecycle workflow with exactly one OCR processing operation:
 * <ol>
 *   <li><strong>Authentication & Upload:</strong> Guest authentication, upload two-page-sample.pdf, verify upload.</li>
 *   <li><strong>Document Preview & Controls:</strong> Page count, page selection toggles, preview card zoom modal.</li>
 *   <li><strong>OCR Processing:</strong> Trigger processing once for both pages, wait with explicit waits, verify transition.</li>
 *   <li><strong>Validation Workspace:</strong> Document preview, extracted data table, page navigation, inline cell edit, OCR overlay highlighting, view-mode switching.</li>
 *   <li><strong>AI Chat:</strong> Open panel, submit a general question, verify genuine assistant response.</li>
 *   <li><strong>Export:</strong> Open export modal, verify format options, download CSV, verify non-empty file.</li>
 *   <li><strong>Navigation:</strong> Navigate away to Projects via navbar, return via browser back, verify workspace reloads.</li>
 * </ol>
 */
public class ComprehensiveWorkflowTest extends BaseTest {

    @BeforeMethod
    public void setupGuestSession() {
        loginAsGuest();
    }

    /**
     * Executes the comprehensive end-to-end document processing workflow.
     */
    @Test(description = "Verify the comprehensive end-to-end document processing workflow with exactly one OCR operation",
          timeOut = 300000)
    public void testCompleteDocumentProcessingWorkflow() throws IOException {

        // ═════════════════════════════════════════════════════════════════════
        // Stage 1: Authentication and Upload
        // ═════════════════════════════════════════════════════════════════════
        String samplePdfPath = testFileUtils.getTestFilePath("two-page-sample.pdf");
        uploadPage.uploadFile(samplePdfPath);

        Assert.assertTrue(documentPreviewPage.isDisplayed(15),
                "Document preview page should be displayed after uploading two-page-sample.pdf");
        Assert.assertEquals(documentPreviewPage.getPreviewCardCount(), 2,
                "Both pages from two-page-sample.pdf should be available on the preview page");

        // ═════════════════════════════════════════════════════════════════════
        // Stage 2: Document Preview and Management
        // ═════════════════════════════════════════════════════════════════════
        Assert.assertTrue(documentPreviewPage.isAnyPageSelected(),
                "Uploaded pages should be initially selected by default");

        // Test page selection and deselection controls
        documentPreviewPage.deselectAllPages();
        Assert.assertFalse(documentPreviewPage.isAnyPageSelected(),
                "No pages should remain selected after clicking Clear");
        Assert.assertFalse(documentPreviewPage.isProcessButtonAvailable(),
                "Process button should not be displayed when all pages are deselected");

        // Select all pages and verify process button
        documentPreviewPage.selectAllPages();
        Assert.assertTrue(documentPreviewPage.isAnyPageSelected(),
                "All pages should be selected after clicking Select all");
        Assert.assertTrue(documentPreviewPage.isProcessButtonEnabled(),
                "Process button should be enabled when pages are selected");

        // Test preview zoom control
        documentPreviewPage.zoomFirstCard();
        Assert.assertTrue(documentPreviewPage.isZoomModalDisplayed(),
                "Zoom preview modal should be visible after clicking Zoom");
        documentPreviewPage.closeZoomModal();
        Assert.assertFalse(documentPreviewPage.isZoomModalDisplayed(),
                "Zoom preview modal should be closed");

        // ═════════════════════════════════════════════════════════════════════
        // Stage 3: OCR Processing (executed exactly once)
        // ═════════════════════════════════════════════════════════════════════
        documentPreviewPage.clickProcess();

        Assert.assertTrue(documentPreviewPage.waitForOcrProgressModal(10),
                "OCR progress modal should appear after clicking Process");

        int ocrTimeoutSeconds = Math.max(testConfig.getProcessingTimeoutSeconds() * 2, 240);
        Assert.assertTrue(documentPreviewPage.waitForOcrComplete(ocrTimeoutSeconds),
                "OCR processing should complete and 'Review results' button should appear within "
                        + ocrTimeoutSeconds + " seconds");

        documentPreviewPage.clickReviewResults();

        Assert.assertTrue(validationPage.isWorkspaceLoaded(15),
                "Validation workspace should load after clicking 'Review results'");
        Assert.assertTrue(validationPage.isExtractedDataPanelDisplayed(),
                "Extracted OCR data panel should be displayed in the Validation workspace");

        // ═════════════════════════════════════════════════════════════════════
        // Stage 4: Validation Workspace
        // ═════════════════════════════════════════════════════════════════════
        Assert.assertTrue(validationPage.isDocumentPanelDisplayed(),
                "Original document preview panel should be displayed in the Validation workspace");
        Assert.assertTrue(validationPage.isExtractedDataPanelDisplayed(),
                "Extracted data table panel should be displayed in the Validation workspace");

        // Navigate between processed document pages
        if (validationPage.isPageNavigationDisplayed()) {
            validationPage.navigateToNextPage();
            Assert.assertEquals(validationPage.getActivePageNumber(), "2",
                    "Page 2 should be active after navigating to the next page");

            validationPage.navigateToPreviousPage();
            Assert.assertEquals(validationPage.getActivePageNumber(), "1",
                    "Page 1 should be active after navigating back to the previous page");
        }

        // Test editing extracted text and saving the changes
        validationPage.enableEditMode();
        Assert.assertTrue(validationPage.isEditModeActive(),
                "Edit mode should be active after clicking 'Edit Table'");

        String updatedText = "Workflow-Edited-" + System.currentTimeMillis();
        validationPage.editFirstCell(updatedText);

        Assert.assertTrue(validationPage.waitForCellEditComplete(5),
                "Inline textarea should unmount after committing edit with Enter");
        Assert.assertEquals(validationPage.getFirstCellText(), updatedText,
                "First table cell should reflect the edited text");

        // Test OCR text highlighting / overlay interaction
        validationPage.hoverFirstDataCell();
        Assert.assertTrue(validationPage.hasOcrBoundingBoxes(),
                "OCR text overlay bounding boxes should be rendered on the document image");

        // Exercise view-mode switching controls
        if (validationPage.isViewModeToolbarDisplayed()) {
            validationPage.switchToTableViewMode();
            Assert.assertTrue(validationPage.isExtractedDataPanelDisplayed(),
                    "Extracted data table should remain visible in Table-only view");
            Assert.assertTrue(validationPage.isDocumentPanelAbsent(),
                    "Document panel should be absent from the DOM in Table-only view");

            validationPage.switchToSplitViewMode();
            Assert.assertTrue(validationPage.isDocumentPanelDisplayed(),
                    "Document panel should be restored upon returning to Split view");
        }

        // ═════════════════════════════════════════════════════════════════════
        // Stage 5: AI Chat
        // ═════════════════════════════════════════════════════════════════════
        chatPanelComponent.open();
        Assert.assertTrue(chatPanelComponent.isOpen(),
                "AI Chat panel should be open in the Validation workspace");

        chatPanelComponent.switchToChatTab();

        String generalQuestion = "What type of document is this?";
        chatPanelComponent.sendMessage(generalQuestion);

        Assert.assertTrue(chatPanelComponent.isUserMessageDisplayed(generalQuestion),
                "Submitted user question should be displayed in the chat history");

        int chatTimeoutSeconds = 60;
        boolean responseReceived = chatPanelComponent.waitForAssistantResponse(chatTimeoutSeconds);
        Assert.assertTrue(responseReceived,
                "AI assistant response should complete within " + chatTimeoutSeconds + " seconds");
        Assert.assertFalse(chatPanelComponent.isLoading(),
                "Loading indicator should not be visible once response is complete");
        Assert.assertFalse(chatPanelComponent.hasError(),
                "Chat panel should not display a service error");

        String assistantText = chatPanelComponent.getLastAssistantResponseText();
        Assert.assertFalse(assistantText.isEmpty(),
                "Assistant response text should not be empty");
        Assert.assertTrue(chatPanelComponent.isAssistantResponseGenuine(),
                "Assistant response should be genuine AI-generated text");

        chatPanelComponent.close();

        // ═════════════════════════════════════════════════════════════════════
        // Stage 6: Export
        // ═════════════════════════════════════════════════════════════════════
        validationPage.openExportModal();
        Assert.assertTrue(exportModalComponent.isOpen(5),
                "Export modal should be displayed after clicking the Export button");
        Assert.assertTrue(exportModalComponent.isFormatOptionsDisplayed(),
                "Available export format options should be visible in the Export modal");

        String exportFilename = "comprehensive_workflow_export_" + System.currentTimeMillis();
        exportModalComponent.setExportFilename(exportFilename);
        exportModalComponent.selectCsvDefault();

        Assert.assertTrue(exportModalComponent.isDownloadButtonEnabled(),
                "Download button should be enabled when filename and CSV format are set");

        exportModalComponent.clickDownload();
        Assert.assertFalse(exportModalComponent.isOpen(5),
                "Export modal should close after initiating download");

        Path downloadedFile = exportModalComponent.waitForDownload(downloadDir, exportFilename, ".csv", 15);
        Assert.assertNotNull(downloadedFile,
                "Exported CSV file should be downloaded into the test download directory within 15 seconds");
        Assert.assertTrue(Files.exists(downloadedFile),
                "Downloaded file must exist on the local filesystem");
        Assert.assertTrue(Files.size(downloadedFile) > 0,
                "Downloaded CSV file must not be empty");

        // ═════════════════════════════════════════════════════════════════════
        // Stage 7: Navigation
        // ═════════════════════════════════════════════════════════════════════
        navbarComponent.clickProjects();
        Assert.assertTrue(projectsPage.isDisplayed(10),
                "Projects page should load successfully after navigating away from Validation");

        driver.navigate().back();
        Assert.assertTrue(validationPage.isWorkspaceLoaded(15),
                "Validation workspace should reload successfully when navigating back");
    }
}
