package com.arkhive.pages;

import com.arkhive.pageobjects.DocumentPreviewPageObjects;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

import java.util.List;

/**
 * Page Object representing Step 1: Document Preview Page (/?step=preview)
 */
public class DocumentPreviewPage extends BasePage {

    private final DocumentPreviewPageObjects pageObjects;

    public DocumentPreviewPage(WebDriver driver) {
        super(driver);
        this.pageObjects = new DocumentPreviewPageObjects();
    }

    public boolean isDisplayed() {
        return isDisplayed(pageObjects.previewHeader) || isDisplayed(pageObjects.previewCards);
    }

    public boolean isDisplayed(int timeoutSeconds) {
        return isDisplayed(pageObjects.previewHeader, timeoutSeconds) || isDisplayed(pageObjects.previewCards, timeoutSeconds);
    }

    public void selectAllPages() {
        if (isDisplayed(pageObjects.selectAllButton)) {
            click(pageObjects.selectAllButton);
        }
    }

    public void deselectAllPages() {
        if (isDisplayed(pageObjects.clearSelectionButton)) {
            click(pageObjects.clearSelectionButton);
        }
    }

    public boolean isAnyPageSelected() {
        return isDisplayed(pageObjects.selectedCountLabel) || isDisplayed(pageObjects.clearSelectionButton);
    }

    public int getPreviewCardCount() {
        try {
            waitForPresence(pageObjects.previewCards);
            List<WebElement> items = driver.findElements(pageObjects.previewCards);
            return items.size();
        } catch (TimeoutException e) {
            return 0;
        }
    }

    public boolean isProcessButtonAvailable() {
        return isDisplayed(pageObjects.processButton, 3);
    }

    public boolean isProcessButtonEnabled() {
        if (!isDisplayed(pageObjects.processButton, 3)) {
            return false;
        }
        return isEnabled(pageObjects.processButton);
    }

    public boolean waitForProcessButtonEnabled(int timeoutSeconds) {
        try {
            org.openqa.selenium.support.ui.WebDriverWait customWait =
                    new org.openqa.selenium.support.ui.WebDriverWait(driver, java.time.Duration.ofSeconds(timeoutSeconds));
            return customWait.until(d -> isProcessButtonEnabled());
        } catch (TimeoutException e) {
            return false;
        }
    }

    public boolean waitForThumbnailsLoaded(int timeoutSeconds) {
        try {
            org.openqa.selenium.support.ui.WebDriverWait customWait =
                    new org.openqa.selenium.support.ui.WebDriverWait(driver, java.time.Duration.ofSeconds(timeoutSeconds));
            return Boolean.TRUE.equals(customWait.until(d -> {
                List<WebElement> cards = driver.findElements(pageObjects.previewCards);
                if (cards.isEmpty()) return false;
                for (WebElement card : cards) {
                    List<WebElement> imgs = card.findElements(org.openqa.selenium.By.tagName("img"));
                    if (imgs.isEmpty()) return false;
                }
                return true;
            }));
        } catch (TimeoutException e) {
            return false;
        }
    }

    public void clickProcess() {
        waitForProcessButtonEnabled(10);
        click(pageObjects.processButton);
        // If low quality confirmation modal is triggered, confirm to proceed with processing
        if (isDisplayed(pageObjects.lowQualityModal, 3)) {
            click(pageObjects.lowQualityModalConfirmButton);
        }
    }

    public boolean hasErrorMessage() {
        return isDisplayed(pageObjects.errorAlert);
    }

    public String getErrorMessage() {
        return getText(pageObjects.errorAlert);
    }
}
