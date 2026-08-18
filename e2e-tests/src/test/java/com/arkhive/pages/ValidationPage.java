package com.arkhive.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

/**
 * Page Object representing Step 2: Validation Page (/validation)
 */
public class ValidationPage {

    private final WebDriver driver;
    private final WebDriverWait wait;

    // Locators for Step 2: Validation Page
    private final By container = By.cssSelector("div.min-h-screen");
    private final By documentViewer = By.xpath("//*[contains(@class, 'document') or contains(@class, 'Document') or contains(text(), 'Document')]");
    private final By extractedDataViewer = By.xpath("//*[contains(@class, 'extracted') or contains(@class, 'Extracted') or contains(text(), 'Extracted Data')]");

    public ValidationPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public boolean isDisplayed() {
        try {
            WebDriverWait longWait = new WebDriverWait(driver, Duration.ofSeconds(20));
            return Boolean.TRUE.equals(longWait.until(d -> {
                try {
                    return d.getCurrentUrl() != null && d.getCurrentUrl().contains("/validation");
                } catch (Exception e) {
                    return false;
                }
            }));
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isDocumentPanelDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(documentViewer)).isDisplayed();
        } catch (TimeoutException e) {
            return false;
        }
    }

    public boolean isExtractedDataPanelDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(extractedDataViewer)).isDisplayed();
        } catch (TimeoutException e) {
            return false;
        }
    }
}
