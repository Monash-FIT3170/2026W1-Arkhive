package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for UploadPage.
 */
public class UploadPageObjects {

    public final By fileInput = By.cssSelector("input[type='file']");
    public final By brandingHeading = By.xpath("//h1[contains(text(),'ARKHIVE')]");
    public final By dropzoneText = By.xpath("//p[contains(text(),'Click to select files, or drop them anywhere')]");
    public final By errorAlert = By.cssSelector(".alert-error");
}
