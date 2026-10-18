package com.arkhive.pageobjects.components;

import org.openqa.selenium.By;

/**
 * Locator definitions for Navbar component.
 */
public class NavbarComponentObjects {

    public final By navbarContainer = By.cssSelector(".navbar");
    public final By brandLogoButton = By.xpath("//div[contains(@class,'navbar')]//button[.//img[@alt='Arkhive logo']]");
    public final By homeNavButton = By.xpath("//div[contains(@class,'navbar')]//button[@title='Home']");
    public final By quickScanNavButton = By.xpath("//div[contains(@class,'navbar')]//button[@title='Quick Scan']");
    public final By projectsNavButton = By.xpath("//div[contains(@class,'navbar')]//button[@title='Projects']");

    // Stepper indicators
    public final By workflowSteps = By.cssSelector(".navbar ul.steps");
    public final By stepQuickScan = By.xpath("//ul[contains(@class,'steps')]//li[contains(@aria-label,'Quick Scan')]");
    public final By stepDocumentPreview = By.xpath("//ul[contains(@class,'steps')]//li[contains(@aria-label,'Document Preview')]");
    public final By stepValidation = By.xpath("//ul[contains(@class,'steps')]//li[contains(@aria-label,'Validation')]");

    // Validation Back button
    public final By validationBackButton = By.xpath("//div[contains(@class,'navbar')]//button[@title='Back']");

    // User Profile Dropdown
    public final By userProfileButton = By.xpath("//div[contains(@class,'dropdown-end')]//button[.*[local-name()='svg' and contains(@class,'lucide-user')]]");
    public final By userProfileDropdownMenu = By.cssSelector("ul.dropdown-content");
    public final By userDisplayName = By.xpath("//ul[contains(@class,'dropdown-content')]//li[contains(@class,'disabled')]//span");
    public final By signOutButton = By.xpath("//ul[contains(@class,'dropdown-content')]//button[contains(.,'Sign Out')]");

    // Guest Mode Controls
    public final By guestBadge = By.xpath("//div[contains(@class,'navbar')]//span[contains(@class,'badge-warning') and contains(.,'Guest')]");
    public final By guestLogInButton = By.xpath("//div[contains(@class,'navbar')]//button[contains(.,'Log In')]");

    // Theme Toggle
    public final By themeToggleInput = By.cssSelector(".navbar input.theme-controller");
}
