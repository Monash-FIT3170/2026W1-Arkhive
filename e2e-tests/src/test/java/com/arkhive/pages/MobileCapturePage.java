package com.arkhive.pages;

import com.arkhive.pageobjects.MobileCapturePageObjects;
import com.arkhive.reporting.ReportLogger;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

import java.nio.file.Path;
import java.util.List;

/**
 * Page Object representing the Mobile QR Capture Page (/upload/mobile/:token).
 * Note: Automation is limited to standard WebDriver file input transfers; physical device
 * camera hardware triggering via capture="environment" cannot be simulated directly in desktop browsers.
 */
public class MobileCapturePage extends BasePage {

    private final MobileCapturePageObjects pageObjects;

    public MobileCapturePage(WebDriver driver) {
        super(driver);
        this.pageObjects = new MobileCapturePageObjects();
    }

    public void open(String baseUrl, String token) {
        String base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        driver.get(base + "/upload/mobile/" + token);
        ReportLogger.info("Opened Mobile Capture page with token");
    }

    public boolean isDisplayed() {
        return isDisplayed(pageObjects.brandHeading);
    }

    public boolean isCheckingToken() {
        return isDisplayed(pageObjects.loadingSpinner, 2);
    }

    public boolean isInvalidTokenDisplayed() {
        return isDisplayed(pageObjects.invalidTokenAlert, 5);
    }

    public String getInvalidTokenMessage() {
        return getText(pageObjects.invalidTokenAlert);
    }

    public void uploadPhoto(String filePath) {
        String fileName = Path.of(filePath).getFileName().toString();
        ReportLogger.info("Selected mobile capture photo: " + fileName);
        waitForInvisibility(pageObjects.loadingSpinner, 5);
        type(pageObjects.galleryFileInput, filePath);
    }

    public int getQueuedPhotoCount() {
        try {
            List<WebElement> thumbnails = driver.findElements(pageObjects.queuedThumbnails);
            return thumbnails.size();
        } catch (Exception e) {
            return 0;
        }
    }

    public void removeQueuedPhoto(int index) {
        List<WebElement> removeButtons = driver.findElements(pageObjects.removePhotoButtons);
        if (index >= 0 && index < removeButtons.size()) {
            removeButtons.get(index).click();
        }
    }

    public void clickUpload() {
        click(pageObjects.uploadPhotosButton);
        ReportLogger.info("Clicked upload photos on mobile capture page");
    }

    public boolean isSuccessDisplayed(int timeoutSeconds) {
        return isDisplayed(pageObjects.successAlert, timeoutSeconds);
    }

    public String getSuccessMessage() {
        return getText(pageObjects.successAlert);
    }

    public boolean hasError() {
        return isDisplayed(pageObjects.errorAlert, 3);
    }

    public String getErrorMessage() {
        return getText(pageObjects.errorAlert);
    }
}
