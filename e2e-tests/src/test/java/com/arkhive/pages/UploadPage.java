package com.arkhive.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

/**
 * Page Object representing Step 0: Upload Landing Page (/)
 */
public class UploadPage {

    private final WebDriver driver;
    private final WebDriverWait wait;

    // Locators for Step 0: Upload Landing Page
    private final By fileInput = By.cssSelector("input[type='file']");
    private final By brandingHeading = By.xpath("//h1[contains(text(),'ARKHIVE')]");
    private final By dropzoneText = By.xpath("//p[contains(text(),'Click to select files, or drop them anywhere')]");
    private final By errorAlert = By.cssSelector(".alert-error");

    public UploadPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public void open(String url) {
        driver.get(url);
    }

    public boolean isDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(brandingHeading)).isDisplayed();
        } catch (TimeoutException e) {
            return false;
        }
    }

    public void uploadFile(String filePath) {
        WebElement input = wait.until(ExpectedConditions.presenceOfElementLocated(fileInput));
        input.sendKeys(filePath);
    }

    public boolean hasErrorMessage() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(errorAlert)).isDisplayed();
        } catch (TimeoutException e) {
            return false;
        }
    }

    public String getErrorMessage() {
        WebElement alert = wait.until(ExpectedConditions.visibilityOfElementLocated(errorAlert));
        return alert.getText();
    }
}
