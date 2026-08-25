package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for ValidationPage.
 */
public class ValidationPageObjects {

    public final By container = By.cssSelector("div.min-h-screen");
    public final By documentViewer = By.xpath("//*[contains(@class, 'document') or contains(@class, 'Document') or contains(text(), 'Document')]");
    public final By extractedDataViewer = By.xpath("//*[contains(@class, 'extracted') or contains(@class, 'Extracted') or contains(text(), 'Extracted Data')]");
}
