package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for DocumentPreviewPage (/?step=preview).
 */
public class DocumentPreviewPageObjects {

    public final By previewHeader = By.xpath("//header[contains(text(),'Preview')]");
    public final By processButton = By.xpath("//button[contains(text(),'Process')]");
    public final By selectAllButton = By.xpath("//button[normalize-space()='Select all']");
    public final By clearSelectionButton = By.xpath("//button[normalize-space()='Clear']");
    public final By selectedCountLabel = By.xpath("//span[contains(text(),'selected (')]");
    public final By deleteSelectedButton = By.xpath("//button[contains(text(),'Delete (')]");
    public final By replaceSelectedButton = By.xpath("//button[contains(text(),'Replace (')]");
    public final By previewCards = By.cssSelector("section div.group.w-40, div.group.w-40");
    public final By cardCheckboxes = By.cssSelector("input[type='checkbox'].checkbox");
    public final By lowQualityModal = By.xpath("//div[contains(@class,'modal-open')]//h3[contains(text(),'Warning: Low Quality Images')]");
    public final By lowQualityModalConfirmButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(text(),'Yes, process anyway')]");
    public final By lowQualityModalCancelButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(text(),'Cancel')]");
    public final By errorAlert = By.xpath("//div[contains(@class,'alert')]");
}
