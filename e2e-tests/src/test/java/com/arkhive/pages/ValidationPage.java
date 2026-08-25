package com.arkhive.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import com.arkhive.pageobjects.ValidationPageObjects;

/**
 * Page Object representing Step 2: Validation Page (/validation)
 */
public class ValidationPage extends BasePage implements ValidationPageObjects {

    public ValidationPage(WebDriver driver) {
        super(driver);
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
