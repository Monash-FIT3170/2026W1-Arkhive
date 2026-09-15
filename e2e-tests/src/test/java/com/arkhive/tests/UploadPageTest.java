package com.arkhive.tests;

import com.arkhive.pages.DocumentPreviewPage;
import com.arkhive.pages.UploadPage;
import com.arkhive.pages.ValidationPage;
import org.testng.Assert;
import org.testng.annotations.Test;

public class UploadPageTest extends BaseTest {

    @Test(description = "Verify that the Upload page dropzone is displayed after guest login setup")
    public void testUploadPageDisplayedAfterGuestLogin() {
        UploadPage uploadPage = pageObjectManager.getUploadPage();

        Assert.assertTrue(uploadPage.isDisplayed(), "The upload page dropzone should be visible after guest mode login");
    }

    @Test(description = "Verify that uploading an oversized file (sample-file.pdf) displays an error message")
    public void testOversizedFileIsRejected() {
        UploadPage uploadPage = pageObjectManager.getUploadPage();

        String oversizedFilePath = testFileUtils.getTestFilePath("sample-file.pdf");
        uploadPage.uploadFile(oversizedFilePath);

        Assert.assertTrue(uploadPage.hasErrorMessage(), "Oversized file upload should display an error message");
        String errorMsg = uploadPage.getErrorMessage();
        Assert.assertTrue(errorMsg.contains("5MB limit") || errorMsg.contains("exceed") || errorMsg.contains("large"),
            "Expected file size error message for sample-file.pdf, got: " + errorMsg);
    }

    @Test(description = "Verify that uploading a valid file transitions to DocumentPreviewPage with preview cards")
    public void testValidFileDisplaysPreview() {
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();

        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(previewPage.isDisplayed(), "DocumentPreviewPage should be displayed upon uploading valid file");
        Assert.assertTrue(previewPage.getPreviewCardCount() > 0, "At least one preview card should be rendered on DocumentPreviewPage");
    }

    @Test(description = "Verify that page selection toggles update the process button enabled state")
    public void testPageSelectionCanBeToggled() {
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();

        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(previewPage.isDisplayed(), "DocumentPreviewPage should be displayed upon uploading valid file");

        previewPage.deselectAllPages();
        Assert.assertFalse(previewPage.isProcessButtonEnabled(), "Process button should be disabled when all pages are deselected");

        previewPage.selectAllPages();
        Assert.assertTrue(previewPage.isProcessButtonEnabled(), "Process button should be enabled when pages are selected");
    }

    @Test(description = "Verify that processing a valid document navigates to ValidationPage")
    public void testValidFileCanBeProcessedToValidation() {
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();
        ValidationPage validationPage = pageObjectManager.getValidationPage();

        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(previewPage.isDisplayed(), "DocumentPreviewPage should be displayed upon uploading valid file");

        previewPage.clickProcess();

        Assert.assertTrue(validationPage.isDisplayed(20), "User should be navigated to ValidationPage after processing document");
    }
}
