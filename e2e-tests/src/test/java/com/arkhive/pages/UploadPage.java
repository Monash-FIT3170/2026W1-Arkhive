package com.arkhive.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

public class UploadPage {

    private final WebDriver driver;
    private final WebDriverWait wait;

    // Locators
    private final By fileInput = By.cssSelector("input[type='file']");
    private final By uploadButton = By.xpath("//button[contains(text(),'Upload') or contains(text(),'Process')]");

    public UploadPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public void open(String url) {
        driver.get(url);
    }

    public void uploadFile(String filePath) {
        wait.until(ExpectedConditions.presenceOfElementLocated(fileInput)).sendKeys(filePath);
    }

    public void clickUpload() {
        wait.until(ExpectedConditions.elementToBeClickable(uploadButton)).click();
    }
}
