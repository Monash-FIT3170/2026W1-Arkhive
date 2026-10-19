package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for UploadPage (Navbar Step 0: /).
 */
public class UploadPageObjects {

    public final By fileInput = By.cssSelector("input[type='file']");
    public final By brandingHeading = By.xpath("//h1[normalize-space()='ARKHIVE']");
    public final By uploadSubheading = By.xpath("//p[contains(text(),'Upload pages to begin OCR extraction')]");
    public final By dropzoneText = By.xpath("//p[contains(text(),'Click to select files, or drop them anywhere')]");
    public final By selectFilesButton = By.xpath("//button[contains(text(),'Select Files')]");
    public final By errorAlert = By.xpath("//div[contains(@class,'alert')]");
}
