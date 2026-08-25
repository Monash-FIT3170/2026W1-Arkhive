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
        return isDisplayed(pageObjects.previewHeader);
    }

    public boolean isClassificationModalDisplayed() {
        return isDisplayed(pageObjects.classificationModalTitle);
    }

    public void confirmClassification() {
        click(pageObjects.confirmClassificationButton);
    }

    public void cancelClassification() {
        click(pageObjects.cancelClassificationButton);
    }

    public int getPreviewCardCount() {
        try {
            waitForPresence(pageObjects.gridItems);
            List<WebElement> items = driver.findElements(pageObjects.gridItems);
            return items.size();
        } catch (TimeoutException e) {
            return 0;
        }
    }

    public void clickProcess() {
        click(pageObjects.processButton);
    }

    public boolean hasErrorMessage() {
        return isDisplayed(pageObjects.errorAlert);
    }

    public String getErrorMessage() {
        return waitForVisible(pageObjects.errorAlert).getText();
    }
}
