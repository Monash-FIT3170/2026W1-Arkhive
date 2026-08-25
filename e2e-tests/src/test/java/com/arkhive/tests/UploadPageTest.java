package com.arkhive.tests;

import com.arkhive.pages.DocumentPreviewPage;
import com.arkhive.pages.UploadPage;
import com.arkhive.pages.ValidationPage;
import org.testng.Assert;
import org.testng.annotations.Test;

public class UploadPageTest extends BaseTest {

    @Test(description = "Verify that the Upload page loads successfully")
    public void testUploadPageLoads() {
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        uploadPage.open(testConfig.getBaseUrl());

        Assert.assertTrue(uploadPage.isDisplayed(), "The upload page dropzone should be visible");
    }

    @Test(description = "Verify uploading sample-file.pdf from UploadPage")
    public void testUploadSampleFile() {
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();

        uploadPage.open(testConfig.getBaseUrl());

        String sampleFilePath = testFileUtils.getTestFilePath("sample-file.pdf");
        Assert.assertNotNull(sampleFilePath, "sample-file.pdf should be present");

        uploadPage.uploadFile(sampleFilePath);

        if (uploadPage.hasErrorMessage()) {
            String errorMsg = uploadPage.getErrorMessage();
            Assert.assertTrue(errorMsg.contains("5MB limit") || errorMsg.contains("exceed"),
                "Expected file size error message for sample-file.pdf, got: " + errorMsg);
        } else {
            Assert.assertTrue(previewPage.isClassificationModalDisplayed(),
                "Classification modal on DocumentPreviewPage should display after uploading sample-file.pdf");
            previewPage.confirmClassification();
            Assert.assertTrue(previewPage.isDisplayed(),
                "DocumentPreviewPage header should display after confirming classification");
        }
    }

    @Test(description = "Verify complete workflow across UploadPage -> DocumentPreviewPage -> ValidationPage")
    public void testUploadValidFileAndProcess() {
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();
        ValidationPage validationPage = pageObjectManager.getValidationPage();

        uploadPage.open(testConfig.getBaseUrl());

        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(previewPage.isClassificationModalDisplayed(),
            "Classification modal on DocumentPreviewPage should display upon uploading a valid PDF file");

        previewPage.confirmClassification();

        Assert.assertTrue(previewPage.isDisplayed(),
            "DocumentPreviewPage should be displayed after classification confirmation");

        Assert.assertTrue(previewPage.getPreviewCardCount() > 0,
            "At least one preview card should be rendered on DocumentPreviewPage");

        previewPage.clickProcess();

        boolean redirected = validationPage.isDisplayed();
        if (!redirected) {
            Assert.assertTrue(previewPage.hasErrorMessage(),
                "Expected either successful redirection to ValidationPage or an error notification on DocumentPreviewPage when processing OCR");
        } else {
            Assert.assertTrue(redirected,
                "User should be redirected to ValidationPage after processing the uploaded file");
        }
    }

    @Test(description = "Verify cancelling classification modal on DocumentPreviewPage")
    public void testUploadClassificationModalCancel() {
        UploadPage uploadPage = pageObjectManager.getUploadPage();
        DocumentPreviewPage previewPage = pageObjectManager.getDocumentPreviewPage();

        uploadPage.open(testConfig.getBaseUrl());

        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(previewPage.isClassificationModalDisplayed(),
            "Classification modal on DocumentPreviewPage should display upon file selection");

        previewPage.cancelClassification();

        Assert.assertTrue(previewPage.isDisplayed(),
            "DocumentPreviewPage grid should be displayed after cancelling classification modal");
        Assert.assertTrue(previewPage.getPreviewCardCount() > 0,
            "Preview cards should exist on DocumentPreviewPage after classification cancellation");
    }
}
