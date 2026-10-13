package com.arkhive.tests;

import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

public class UploadPageTest extends BaseTest {

    @BeforeMethod
    public void setupGuestSession() {
        loginAsGuest();
    }

    @Test(description = "Verify that uploading an oversized file (sample-file.pdf) displays an error message")
    public void testOversizedFileIsRejected() {
        String oversizedFilePath = testFileUtils.getTestFilePath("sample-file.pdf");
        uploadPage.uploadFile(oversizedFilePath);

        Assert.assertTrue(uploadPage.hasErrorMessage(5), "Oversized file upload should display an error message");
        String errorMsg = uploadPage.getErrorMessage();
        Assert.assertTrue(errorMsg.contains("exceed the 5MB limit"),
            "Expected file size error message mentioning 'exceed the 5MB limit', got: " + errorMsg);
    }

    @Test(description = "Verify that uploading a valid file transitions to DocumentPreviewPage with preview cards")
    public void testValidFileDisplaysPreview() {
        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(documentPreviewPage.isDisplayed(15), "DocumentPreviewPage should be displayed upon uploading valid file");
        Assert.assertTrue(documentPreviewPage.getPreviewCardCount() > 0, "At least one preview card should be rendered on DocumentPreviewPage");
    }

    @Test(description = "Verify that page selection toggles update the process button enabled state")
    public void testPageSelectionCanBeToggled() {
        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(documentPreviewPage.isDisplayed(15), "DocumentPreviewPage should be displayed upon uploading valid file");
        Assert.assertTrue(documentPreviewPage.isAnyPageSelected(), "Uploaded pages should be initially selected");

        documentPreviewPage.deselectAllPages();
        Assert.assertFalse(documentPreviewPage.isAnyPageSelected(), "No pages should remain selected after deselecting all");
        Assert.assertFalse(documentPreviewPage.isProcessButtonAvailable(), "Process button should not be displayed when all pages are deselected");

        documentPreviewPage.selectAllPages();
        Assert.assertTrue(documentPreviewPage.isAnyPageSelected(), "Pages should be selected after clicking Select all");
        Assert.assertTrue(documentPreviewPage.isProcessButtonEnabled(), "Process button should be enabled when pages are selected");
    }

    @Test(description = "Verify that processing a valid document navigates to ValidationPage", timeOut = 180000)
    public void testValidFileCanBeProcessedToValidation() {
        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(documentPreviewPage.isDisplayed(15), "DocumentPreviewPage should be displayed upon uploading valid file");

        documentPreviewPage.clickProcess();

        int timeout = testConfig.getProcessingTimeoutSeconds();
        Assert.assertTrue(validationPage.isWorkspaceLoaded(timeout),
            "User should be navigated to ValidationPage after processing document (allowing up to " + timeout + " seconds)");
    }
}
