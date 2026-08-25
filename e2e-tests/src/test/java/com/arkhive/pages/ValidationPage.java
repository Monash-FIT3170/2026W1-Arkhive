package com.arkhive.pages;

import com.arkhive.pageobjects.ValidationPageObjects;
import org.openqa.selenium.WebDriver;

/**
 * Page Object representing Step 2: Validation Page (/validation)
 */
public class ValidationPage extends BasePage {

    private final ValidationPageObjects pageObjects;

    public ValidationPage(WebDriver driver) {
        super(driver);
        this.pageObjects = new ValidationPageObjects();
    }

    public boolean isDisplayed() {
        return waitForUrlContains("/validation");
    }

    public boolean isDocumentPanelDisplayed() {
        return isDisplayed(pageObjects.documentViewer);
    }

    public boolean isExtractedDataPanelDisplayed() {
        return isDisplayed(pageObjects.extractedDataViewer);
    }
}
