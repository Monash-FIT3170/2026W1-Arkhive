package com.arkhive.pages;

import com.arkhive.pageobjects.ValidationPageObjects;
import org.openqa.selenium.WebDriver;

/**
 * Page Object representing Step 2: Validation Page (/validation)
 */
public class ValidationPage extends BasePage implements ValidationPageObjects {

    public ValidationPage(WebDriver driver) {
        super(driver);
    }

    public boolean isDisplayed() {
        return waitForUrlContains("/validation");
    }

    public boolean isDocumentPanelDisplayed() {
        return isDisplayed(documentViewer);
    }

    public boolean isExtractedDataPanelDisplayed() {
        return isDisplayed(extractedDataViewer);
    }
}
