package com.arkhive.pages;

import com.arkhive.pageobjects.DocumentPreviewPageObjects;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

import java.util.List;

/**
 * Page Object representing Step 1: Document Preview Page (/?step=preview)
 */
public class DocumentPreviewPage extends BasePage implements DocumentPreviewPageObjects {

    public DocumentPreviewPage(WebDriver driver) {
        super(driver);
    }

    public boolean isDisplayed() {
        return isDisplayed(previewHeader);
    }

    public boolean isClassificationModalDisplayed() {
        return isDisplayed(classificationModalTitle);
    }

    public void confirmClassification() {
        click(confirmClassificationButton);
    }

    public void cancelClassification() {
        click(cancelClassificationButton);
    }

    public int getPreviewCardCount() {
        try {
            waitForPresence(gridItems);
            List<WebElement> items = driver.findElements(gridItems);
            return items.size();
        } catch (TimeoutException e) {
            return 0;
        }
    }

    public void clickProcess() {
        click(processButton);
    }

    public boolean hasErrorMessage() {
        return isDisplayed(errorAlert);
    }

    public String getErrorMessage() {
        return waitForVisible(errorAlert).getText();
    }
}
