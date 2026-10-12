package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for ValidationPage.
 */
public class ValidationPageObjects {

    public final By loadingIndicator = By.xpath("//div[normalize-space()='Loading...']");
    public final By workspaceContainer = By.xpath("//div[contains(@class,'bg-base-100') and .//button[contains(.,'Split') or contains(.,'Document')]]");
    public final By viewModeGroup = By.xpath("//div[contains(@class,'join')][.//button[contains(.,'Split')]]");
    public final By splitViewButton = By.xpath("//button[@title='Side-by-side Split View' or contains(.,'Split')]");
    public final By documentViewButton = By.xpath("//button[@title='Document Full Focus View' or contains(.,'Document')]");
    public final By tableViewButton = By.xpath("//button[contains(.,'Table')]");
    public final By documentViewer = By.xpath("//*[contains(@class,'document') or contains(@class,'Document') or .//canvas or .//img[contains(@class,'object-contain')]]");
    public final By extractedDataViewer = By.xpath("//table | //div[contains(@class,'overflow-x-auto')]");
    public final By confidenceBadge = By.xpath("//div[contains(.,'Confidence:')]");
}
