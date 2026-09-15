package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for UploadPage (Navbar Step 0: /).
 */
public class UploadPageObjects {

    public final By fileInput = By.cssSelector("input[type='file']");
    public final By brandingHeading = By.xpath("//*[self::h1 or self::button][contains(text(),'Arkhive') or contains(text(),'ARKHIVE')]");
    public final By dropzoneText = By.xpath("//p[contains(text(),'Click to select files, or drop them anywhere')]");
    public final By errorAlert = By.cssSelector(".alert-error");
}
