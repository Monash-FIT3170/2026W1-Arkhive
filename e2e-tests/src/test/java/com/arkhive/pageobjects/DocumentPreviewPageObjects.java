package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for DocumentPreviewPage.
 */
public class DocumentPreviewPageObjects {

    public final By previewHeader = By.xpath("//header[contains(text(),'Preview')]");
    public final By sidebarHeading = By.xpath("//h2[contains(text(),'Document Processing')]");
    public final By classificationModalTitle = By.xpath("//h3[contains(text(),'Classify Documents')]");
    public final By confirmClassificationButton = By.xpath("//button[contains(text(),'Confirm Classification')]");
    public final By cancelClassificationButton = By.xpath("//button[contains(text(),'Cancel')]");
    public final By processButton = By.xpath("//button[contains(text(),'Process')]");
    public final By gridItems = By.cssSelector("main div.grid > article");
    public final By errorAlert = By.cssSelector(".alert-error");
}
