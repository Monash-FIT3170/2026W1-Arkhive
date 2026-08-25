package com.arkhive.pages;

import com.arkhive.pageobjects.UploadPageObjects;
import org.openqa.selenium.WebDriver;

/**
 * Page Object representing Step 0: Upload Landing Page (/)
 */
public class UploadPage extends BasePage implements UploadPageObjects {

    public UploadPage(WebDriver driver) {
        super(driver);
    }

    public void open(String url) {
        driver.get(url);
    }

    public boolean isDisplayed() {
        return isDisplayed(brandingHeading);
    }

    public void uploadFile(String filePath) {
        type(fileInput, filePath);
    }

    public boolean hasErrorMessage() {
        return isDisplayed(errorAlert);
    }

    public String getErrorMessage() {
        return waitForVisible(errorAlert).getText();
    }
}
