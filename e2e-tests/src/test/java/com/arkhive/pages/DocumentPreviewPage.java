package com.arkhive.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.List;

/**
 * Page Object representing Step 1: Document Preview Page (/?step=preview)
 */
public class DocumentPreviewPage {

    private final WebDriver driver;
    private final WebDriverWait wait;

    // Locators for Step 1: Document Preview Page
    private final By previewHeader = By.xpath("//header[contains(text(),'Preview')]");
    private final By sidebarHeading = By.xpath("//h2[contains(text(),'Document Processing')]");
    private final By classificationModalTitle = By.xpath("//h3[contains(text(),'Classify Documents')]");
    private final By confirmClassificationButton = By.xpath("//button[contains(text(),'Confirm Classification')]");
    private final By cancelClassificationButton = By.xpath("//button[contains(text(),'Cancel')]");
    private final By processButton = By.xpath("//button[contains(text(),'Process')]");
    private final By gridItems = By.cssSelector("main div.grid > article");
    private final By errorAlert = By.cssSelector(".alert-error");

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
