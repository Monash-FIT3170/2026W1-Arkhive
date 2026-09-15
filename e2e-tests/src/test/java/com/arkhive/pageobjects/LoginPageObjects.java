package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for LoginPage and guest mode confirmation modal.
 */
public class LoginPageObjects {

    public final By brandHeading = By.xpath("//h1[contains(text(),'Arkhive')]");
    public final By loginTab = By.xpath("//button[contains(text(),'Login')]");
    public final By registerTab = By.xpath("//button[contains(text(),'Register')]");
    public final By emailInput = By.cssSelector("input[type='email']");
    public final By passwordInput = By.cssSelector("input[type='password']");
    public final By signInButton = By.xpath("//button[contains(text(),'Sign In')]");
    public final By googleSignInButton = By.xpath("//button[contains(text(),'Continue with Google')]");
    public final By continueAsGuestButton = By.xpath("//button[contains(text(),'Continue as Guest')]");
    public final By guestModalTitle = By.xpath("//h3[contains(text(),'Guest Mode')]");
    public final By guestModalConfirmButton = By.xpath("//div[contains(@class,'modal-box')]//button[contains(text(),'Continue as Guest')]");
    public final By errorAlert = By.cssSelector(".alert-error");
}
