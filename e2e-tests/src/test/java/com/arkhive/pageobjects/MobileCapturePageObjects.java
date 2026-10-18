package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for MobileCapturePage (/upload/mobile/:token).
 */
public class MobileCapturePageObjects {

    public final By brandHeading = By.xpath("//h1[normalize-space()='Arkhive']");
    public final By loadingSpinner = By.cssSelector(".loading-spinner");
    public final By invalidTokenAlert = By.cssSelector(".alert.alert-warning");
    public final By errorAlert = By.cssSelector(".alert.alert-error");
    public final By successAlert = By.cssSelector(".alert.alert-success");

    // File inputs
    public final By galleryFileInput = By.xpath("//input[@type='file' and @multiple]");
    public final By cameraFileInput = By.xpath("//input[@type='file' and @capture='environment']");

    // Action buttons
    public final By takePhotoButton = By.xpath("//button[normalize-space()='Take photo']");
    public final By choosePhotosButton = By.xpath("//button[normalize-space()='Choose photos']");
    public final By uploadPhotosButton = By.xpath("//button[contains(.,'Upload') and not(contains(.,'successful'))]");

    // Queued items
    public final By queuedThumbnails = By.xpath("//div[contains(@class,'grid')]//img");
    public final By removePhotoButtons = By.xpath("//div[contains(@class,'grid')]//button[@aria-label='Remove photo']");
}
