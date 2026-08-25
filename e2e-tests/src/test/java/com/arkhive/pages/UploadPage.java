package com.arkhive.pages;

import com.arkhive.pageobjects.UploadPageObjects;
import org.openqa.selenium.WebDriver;

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
        driver.get(url);
    }

    public boolean isDisplayed() {
        return isDisplayed(pageObjects.brandingHeading);
    }

    public void uploadFile(String filePath) {
        type(pageObjects.fileInput, filePath);
    }

    public boolean hasErrorMessage() {
        return isDisplayed(pageObjects.errorAlert);
    }

    public String getErrorMessage() {
        return waitForVisible(pageObjects.errorAlert).getText();
    }
}
