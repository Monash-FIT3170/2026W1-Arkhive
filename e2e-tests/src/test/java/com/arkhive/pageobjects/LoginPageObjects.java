package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for LoginPage and guest mode confirmation modal.
 */
public class LoginPageObjects {

    public final By brandHeading = By.xpath("//h1[contains(text(),'Arkhive')]");
    public final By loginTab = By.xpath("//button[contains(text(),'Login')]");
    public final By registerTab = By.xpath("//button[contains(text(),'Register')]");
    public final By displayNameInput = By.cssSelector("input[placeholder*='Display Name']");
    public final By lastNameInput = By.cssSelector("input[placeholder*='Last Name']");
    public final By emailInput = By.cssSelector("input[type='email']");
    public final By passwordInput = By.cssSelector("input[type='password'][placeholder='Password']");
    public final By confirmPasswordInput = By.cssSelector("input[placeholder*='Confirm Password']");
    public final By signInButton = By.xpath("//button[contains(text(),'Sign In')]");
    public final By createAccountButton = By.xpath("//button[contains(text(),'Create Account')]");
    public final By googleSignInButton = By.xpath("//button[contains(text(),'Continue with Google')]");
    public final By continueAsGuestButton = By.xpath("//button[contains(text(),'Continue as Guest')]");
    public final By guestModalTitle = By.xpath("//div[contains(@class,'modal-box')]//h3[contains(text(),'Guest Mode')]");
    public final By guestModalConfirmButton = By.xpath("//div[contains(@class,'modal-box')]//button[contains(text(),'Continue as Guest')]");
    public final By guestModalGoBackButton = By.xpath("//div[contains(@class,'modal-box')]//button[contains(text(),'Go Back')]");
    public final By errorAlert = By.cssSelector(".alert-error");
    public final By successAlert = By.cssSelector(".alert-success");
}
