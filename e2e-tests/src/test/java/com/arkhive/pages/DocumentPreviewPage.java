package com.arkhive.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.List;

import com.arkhive.pageobjects.DocumentPreviewPageObjects;

/**
 * Page Object representing Step 1: Document Preview Page (/?step=preview)
 */
public class DocumentPreviewPage implements DocumentPreviewPageObjects {

    private final WebDriver driver;
    private final WebDriverWait wait;

    public DocumentPreviewPage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    public boolean isDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(previewHeader)).isDisplayed();
        } catch (TimeoutException e) {
            return false;
        }
    }

    public boolean isClassificationModalDisplayed() {
        try {
            return wait.until(ExpectedConditions.visibilityOfElementLocated(classificationModalTitle)).isDisplayed();
        } catch (TimeoutException e) {
            return false;
        }
    }

    public void confirmClassification() {
        wait.until(ExpectedConditions.elementToBeClickable(confirmClassificationButton)).click();
    }

    public void cancelClassification() {
        wait.until(ExpectedConditions.elementToBeClickable(cancelClassificationButton)).click();
    }

    public int getPreviewCardCount() {
        try {
            wait.until(ExpectedConditions.presenceOfElementLocated(gridItems));
            List<WebElement> items = driver.findElements(gridItems);
            return items.size();
        } catch (TimeoutException e) {
            return 0;
        }
    }

    public void clickProcess() {
        wait.until(ExpectedConditions.elementToBeClickable(processButton)).click();
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
