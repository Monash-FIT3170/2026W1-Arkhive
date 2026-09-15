package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for DocumentPreviewPage (/?step=preview).
 */
public class DocumentPreviewPageObjects {

    public final By previewHeader = By.xpath("//header[contains(text(),'Preview')]");
    public final By sidebarHeading = By.xpath("//h2[contains(text(),'Document Processing')]");
    public final By processButton = By.xpath("//button[contains(text(),'Process')]");
    public final By selectAllButton = By.xpath("//button[contains(text(),'Select All Pages')]");
    public final By deselectAllButton = By.xpath("//button[contains(text(),'Deselect All Pages')]");
    public final By removeSelectedButton = By.xpath("//button[contains(text(),'Remove Selected')]");
    public final By replaceSelectedButton = By.xpath("//button[contains(text(),'Replace Selected')]");
    public final By removeModalConfirmButton = By.xpath("//div[contains(@class,'modal-box')]//button[contains(text(),'Remove')]");
    public final By replaceModalConfirmButton = By.xpath("//div[contains(@class,'modal-box')]//button[contains(text(),'Replace')]");
    public final By gridItems = By.cssSelector("article");
    public final By toastNotification = By.cssSelector(".toast");
    public final By errorAlert = By.cssSelector(".alert-error");
    public final By successAlert = By.cssSelector(".alert-success");
}
