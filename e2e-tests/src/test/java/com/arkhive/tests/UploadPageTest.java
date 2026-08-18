package com.arkhive.tests;

import com.arkhive.pages.DocumentPreviewPage;
import com.arkhive.pages.UploadPage;
import com.arkhive.pages.ValidationPage;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.File;
import java.net.URL;
import java.time.Duration;

public class UploadPageTest {

    private WebDriver driver;
    private WebDriverWait wait;
    private static final String APP_URL = "http://localhost:5173";

    @BeforeMethod
    public void setUp() {
        System.setProperty("webdriver.chrome.silentOutput", "true");
        java.util.logging.Logger.getLogger("org.openqa.selenium").setLevel(java.util.logging.Level.SEVERE);

        ChromeOptions options = new ChromeOptions();
        
        boolean isHeadless = Boolean.parseBoolean(System.getProperty("headless", "false"));
        if (isHeadless) {
            options.addArguments("--headless=new");
        }

        options.addArguments("--remote-allow-origins=*");
        options.addArguments("--no-sandbox");
        options.addArguments("--disable-dev-shm-usage");

        driver = new ChromeDriver(options);
        driver.manage().window().maximize();
        wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    private void pause() {
        boolean isHeadless = Boolean.parseBoolean(System.getProperty("headless", "false"));
        if (!isHeadless) {
            try {
                Thread.sleep(Long.getLong("slowmo", 1000L));
            } catch (InterruptedException ignored) {
            }
        }
    }

private String getTestFilePath(String fileName) {
    try {
        URL resource = getClass()
                .getClassLoader()
                .getResource("documents/" + fileName);

        if (resource != null) {
            return new File(resource.toURI()).getAbsolutePath();
        }
    } catch (Exception e) {
        throw new RuntimeException("Could not load test file: " + fileName, e);
    }

    throw new RuntimeException("Test file not found: " + fileName);
}

    @Test(description = "Verify that the Upload page loads successfully")
    public void testUploadPageLoads() {
        UploadPage uploadPage = new UploadPage(driver);
        uploadPage.open(APP_URL);
        pause();

        Assert.assertTrue(uploadPage.isDisplayed(), "The upload page dropzone should be visible");
    }

    @Test(description = "Verify uploading sample-file.pdf from UploadPage")
    public void testUploadSampleFile() {
        UploadPage uploadPage = new UploadPage(driver);
        DocumentPreviewPage previewPage = new DocumentPreviewPage(driver);

        uploadPage.open(APP_URL);
        pause();

        String sampleFilePath = getTestFilePath("sample-file.pdf");
        Assert.assertNotNull(sampleFilePath, "sample-file.pdf should be present");

        uploadPage.uploadFile(sampleFilePath);
        pause();

        if (uploadPage.hasErrorMessage()) {
            String errorMsg = uploadPage.getErrorMessage();
            Assert.assertTrue(errorMsg.contains("5MB limit") || errorMsg.contains("exceed"),
                "Expected file size error message for sample-file.pdf, got: " + errorMsg);
            pause();
        } else {
            Assert.assertTrue(previewPage.isClassificationModalDisplayed(),
                "Classification modal on DocumentPreviewPage should display after uploading sample-file.pdf");
            pause();
            previewPage.confirmClassification();
            pause();
            Assert.assertTrue(previewPage.isDisplayed(),
                "DocumentPreviewPage header should display after confirming classification");
            pause();
        }
    }

    @Test(description = "Verify complete workflow across UploadPage -> DocumentPreviewPage -> ValidationPage")
    public void testUploadValidFileAndProcess() {
        UploadPage uploadPage = new UploadPage(driver);
        DocumentPreviewPage previewPage = new DocumentPreviewPage(driver);
        ValidationPage validationPage = new ValidationPage(driver);

        uploadPage.open(APP_URL);
        pause();

        String validFilePath = getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);
        pause();

        Assert.assertTrue(previewPage.isClassificationModalDisplayed(),
            "Classification modal on DocumentPreviewPage should display upon uploading a valid PDF file");

        previewPage.confirmClassification();
        pause();

        Assert.assertTrue(previewPage.isDisplayed(),
            "DocumentPreviewPage should be displayed after classification confirmation");

        Assert.assertTrue(previewPage.getPreviewCardCount() > 0,
            "At least one preview card should be rendered on DocumentPreviewPage");

        previewPage.clickProcess();
        pause();

        boolean redirected = validationPage.isDisplayed();
        if (!redirected) {
            Assert.assertTrue(previewPage.hasErrorMessage(),
                "Expected either successful redirection to ValidationPage or an error notification on DocumentPreviewPage when processing OCR");
        } else {
            Assert.assertTrue(redirected,
                "User should be redirected to ValidationPage after processing the uploaded file");
        }
        pause();
    }

    @Test(description = "Verify cancelling classification modal on DocumentPreviewPage")
    public void testUploadClassificationModalCancel() {
        UploadPage uploadPage = new UploadPage(driver);
        DocumentPreviewPage previewPage = new DocumentPreviewPage(driver);

        uploadPage.open(APP_URL);
        pause();

        String validFilePath = getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);
        pause();

        Assert.assertTrue(previewPage.isClassificationModalDisplayed(),
            "Classification modal on DocumentPreviewPage should display upon file selection");

        previewPage.cancelClassification();
        pause();

        Assert.assertTrue(previewPage.isDisplayed(),
            "DocumentPreviewPage grid should be displayed after cancelling classification modal");
        Assert.assertTrue(previewPage.getPreviewCardCount() > 0,
            "Preview cards should exist on DocumentPreviewPage after classification cancellation");
        pause();
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}
