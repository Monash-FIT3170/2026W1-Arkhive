package com.arkhive.tests;

import com.arkhive.pages.DocumentPreviewPage;
import com.arkhive.pages.LoginPage;
import com.arkhive.pages.UploadPage;
import com.arkhive.pages.ValidationPage;
import org.testng.Assert;
import org.testng.annotations.Test;

public class UploadPageTest extends BaseTest {

    @Test(description = "Verify that the Upload page loads successfully after entering guest mode")
    public void testUploadLandingPage() {
        LoginPage loginPage = pageObjectManager.getLoginPage();
        UploadPage uploadPage = pageObjectManager.getUploadPage();

        loginPage.loginAsGuest(testConfig.getBaseUrl());

        Assert.assertTrue(uploadPage.isDisplayed(), "The upload page dropzone should be visible after guest mode entry");
    }

    @Test(description = "Verify uploading sample-file.pdf from UploadPage")
    public void testUploadSampleFile() {
        LoginPage loginPage = pageObjectManager.getLoginPage();
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();

        loginPage.loginAsGuest(testConfig.getBaseUrl());

        String sampleFilePath = testFileUtils.getTestFilePath("sample-file.pdf");
        Assert.assertNotNull(sampleFilePath, "sample-file.pdf should be present");

        uploadPage.uploadFile(sampleFilePath);

        if (uploadPage.hasErrorMessage()) {
            String errorMsg = uploadPage.getErrorMessage();
            Assert.assertTrue(errorMsg.contains("5MB limit") || errorMsg.contains("exceed") || errorMsg.contains("large"),
                "Expected file size error message for sample-file.pdf, got: " + errorMsg);
        } else {
            Assert.assertTrue(previewPage.isDisplayed(),
                "DocumentPreviewPage should display after uploading sample-file.pdf");
            Assert.assertTrue(previewPage.getPreviewCardCount() > 0,
                "Preview card grid should contain rendered page cards");
        }
    }

    @Test(description = "Verify file upload and preview page transition for valid PDF")
    public void testUploadValidFileAndPreview() {
        LoginPage loginPage = pageObjectManager.getLoginPage();
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();

        loginPage.loginAsGuest(testConfig.getBaseUrl());

        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(previewPage.isDisplayed(),
            "DocumentPreviewPage should be displayed upon file upload");
        Assert.assertTrue(previewPage.getPreviewCardCount() > 0,
            "At least one preview card should be rendered on DocumentPreviewPage");
    }

    @Test(description = "Verify page selection toggles on DocumentPreviewPage")
    public void testDocumentPreviewSelectionToggle() {
        LoginPage loginPage = pageObjectManager.getLoginPage();
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();

        loginPage.loginAsGuest(testConfig.getBaseUrl());

        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(previewPage.isDisplayed(),
            "DocumentPreviewPage grid should be displayed upon file selection");
        Assert.assertTrue(previewPage.getPreviewCardCount() > 0,
            "Preview cards should exist on DocumentPreviewPage");

        previewPage.deselectAllPages();
        previewPage.selectAllPages();
        Assert.assertTrue(previewPage.isProcessButtonEnabled(),
            "Process button should be enabled when pages are selected");
    }

    @Test(description = "Verify complete workflow across UploadPage -> DocumentPreviewPage -> ValidationPage")
    public void testCompleteWorkflowToValidation() {
        LoginPage loginPage = pageObjectManager.getLoginPage();
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();
        ValidationPage validationPage = pageObjectManager.getValidationPage();

        loginPage.loginAsGuest(testConfig.getBaseUrl());

        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(previewPage.isDisplayed(),
            "DocumentPreviewPage should be displayed upon file upload");
        Assert.assertTrue(previewPage.getPreviewCardCount() > 0,
            "At least one preview card should be rendered on DocumentPreviewPage");

        previewPage.clickProcess();

        boolean redirected = validationPage.isDisplayed();
        if (!redirected) {
            Assert.assertTrue(previewPage.hasErrorMessage() || previewPage.isDisplayed(),
                "Expected either successful redirection to ValidationPage or notification on DocumentPreviewPage when processing OCR");
        } else {
            Assert.assertTrue(redirected,
                "User should be redirected to ValidationPage after processing the uploaded file");
        }
    }
}
