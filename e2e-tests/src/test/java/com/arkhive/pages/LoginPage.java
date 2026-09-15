package com.arkhive.pages;

import com.arkhive.pageobjects.LoginPageObjects;
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
        driver.get(baseUrl + "/login");
    }

    public boolean isDisplayed() {
        return isDisplayed(pageObjects.brandHeading) || isDisplayed(pageObjects.continueAsGuestButton);
    }

    public void clickContinueAsGuest() {
        click(pageObjects.continueAsGuestButton);
        waitForVisible(pageObjects.guestModalTitle);
        click(pageObjects.guestModalConfirmButton);
    }

    public void loginAsGuest(String baseUrl) {
        if (!driver.getCurrentUrl().contains("/login")) {
            driver.get(baseUrl);
        }
        if (driver.getCurrentUrl().contains("/login") || isDisplayed()) {
            clickContinueAsGuest();
        }
    }

    public void loginWithEmailPassword(String email, String password) {
        type(pageObjects.emailInput, email);
        type(pageObjects.passwordInput, password);
        click(pageObjects.signInButton);
    }

    public boolean hasErrorMessage() {
        return isDisplayed(pageObjects.errorAlert);
    }

    public String getErrorMessage() {
        return waitForVisible(pageObjects.errorAlert).getText();
    }
}
