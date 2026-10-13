package com.arkhive.pages;

import com.arkhive.pageobjects.UploadPageObjects;
import com.arkhive.reporting.ReportLogger;
import org.openqa.selenium.WebDriver;

import java.nio.file.Path;

/**
 * Page Object representing Step 0: Upload Landing Page (/)
 */
public class UploadPage extends BasePage {

    private final UploadPageObjects pageObjects;

    public UploadPage(WebDriver driver) {
        super(driver);
        this.pageObjects = new UploadPageObjects();
    }

    public void open(String url) {
        String target = url.endsWith("/upload") ? url : url + "/upload";
        driver.get(target);
        ReportLogger.info("Opened Document Upload page");
    }

    public boolean isDisplayed() {
        return isDisplayed(pageObjects.brandingHeading) || isDisplayed(pageObjects.dropzoneText);
    }

    public boolean isDropzoneDisplayed() {
        return isDisplayed(pageObjects.dropzoneText);
    }

    public void uploadFile(String filePath) {
        String filename = Path.of(filePath).getFileName().toString();
        type(pageObjects.fileInput, filePath);
        ReportLogger.info("Selected document for upload: " + filename);
    }

    public boolean hasErrorMessage() {
        return isDisplayed(pageObjects.errorAlert);
    }

    public boolean hasErrorMessage(int timeoutSeconds) {
        return isDisplayed(pageObjects.errorAlert, timeoutSeconds);
    }

    public String getErrorMessage() {
        return getText(pageObjects.errorAlert);
    }
}
