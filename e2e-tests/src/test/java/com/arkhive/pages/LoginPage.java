package com.arkhive.pages;

import com.arkhive.pageobjects.LoginPageObjects;
import com.arkhive.reporting.ReportLogger;
import org.openqa.selenium.WebDriver;

/**
 * Page Object representing the Login / Authentication Page (/login)
 * and handling Guest Mode session initiation.
 */
public class LoginPage extends BasePage {

    private final LoginPageObjects pageObjects;

    public LoginPage(WebDriver driver) {
        super(driver);
        this.pageObjects = new LoginPageObjects();
    }

    public void open(String baseUrl) {
        String target = baseUrl.endsWith("/login") ? baseUrl : baseUrl + "/login";
        driver.get(target);
        ReportLogger.info("Navigated to Login page");
    }

    public boolean isDisplayed() {
        return isDisplayed(pageObjects.brandHeading) && (isDisplayed(pageObjects.signInButton) || isDisplayed(pageObjects.createAccountButton) || isDisplayed(pageObjects.continueAsGuestButton));
    }

    public void switchToLoginTab() {
        click(pageObjects.loginTab);
        ReportLogger.info("Switched to Login tab");
    }

    public void switchToRegisterTab() {
        click(pageObjects.registerTab);
        ReportLogger.info("Switched to Register tab");
    }

    public boolean isRegisterModeDisplayed() {
        return isDisplayed(pageObjects.displayNameInput) && isDisplayed(pageObjects.createAccountButton);
    }

    public void clickContinueAsGuest() {
        click(pageObjects.continueAsGuestButton);
        waitForVisible(pageObjects.guestModalTitle);
        click(pageObjects.guestModalConfirmButton);
        waitForInvisibility(pageObjects.guestModalTitle, 5);
        ReportLogger.info("Confirmed guest access in guest modal");
    }

    public void cancelGuestModal() {
        click(pageObjects.continueAsGuestButton);
        waitForVisible(pageObjects.guestModalTitle);
        click(pageObjects.guestModalGoBackButton);
        waitForInvisibility(pageObjects.guestModalTitle, 5);
        ReportLogger.info("Cancelled guest access modal");
    }

    public void loginAsGuest(String baseUrl) {
        if (!driver.getCurrentUrl().contains("/login")) {
            open(baseUrl);
        }
        if (driver.getCurrentUrl().contains("/login") || isDisplayed()) {
            clickContinueAsGuest();
            ReportLogger.pass("Guest authentication completed");
        }
    }

    public void loginWithEmailPassword(String email, String password) {
        if (!isDisplayed(pageObjects.signInButton)) {
            switchToLoginTab();
        }
        clearAndType(pageObjects.emailInput, email);
        clearAndType(pageObjects.passwordInput, password);
        click(pageObjects.signInButton);
        ReportLogger.info("Submitted login credentials for user: " + email);
    }

    public void register(String displayName, String lastName, String email, String password, String confirmPassword) {
        if (!isRegisterModeDisplayed()) {
            switchToRegisterTab();
        }
        clearAndType(pageObjects.displayNameInput, displayName);
        if (lastName != null && !lastName.isEmpty()) {
            clearAndType(pageObjects.lastNameInput, lastName);
        }
        clearAndType(pageObjects.emailInput, email);
        clearAndType(pageObjects.passwordInput, password);
        clearAndType(pageObjects.confirmPasswordInput, confirmPassword);
        click(pageObjects.createAccountButton);
        ReportLogger.info("Submitted registration form for user: " + email);
    }

    public boolean hasErrorMessage() {
        return isDisplayed(pageObjects.errorAlert);
    }

    public String getErrorMessage() {
        return getText(pageObjects.errorAlert);
    }

    public boolean hasSuccessMessage() {
        return isDisplayed(pageObjects.successAlert);
    }

    public String getSuccessMessage() {
        return getText(pageObjects.successAlert);
    }
}
