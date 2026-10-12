package com.arkhive.tests;

import com.arkhive.pages.LoginPage;
import com.arkhive.pages.UploadPage;
import org.testng.Assert;
import org.testng.annotations.Test;

public class LoginPageTest extends BaseTest {

    @Test(description = "Verify that navigating to /login displays the Login page elements")
    public void testLoginPageDisplayed() {
        LoginPage loginPage = pageObjectManager.getLoginPage();
        loginPage.open(testConfig.getBaseUrl());

        Assert.assertTrue(loginPage.isDisplayed(), "The login page brand header and form elements should be visible");
    }

    @Test(description = "Verify continuing as guest from Login page grants access to Upload page")
    public void testGuestLoginGrantsUploadAccess() {
        LoginPage loginPage = pageObjectManager.getLoginPage();
        UploadPage uploadPage = pageObjectManager.getUploadPage();

        loginPage.open(testConfig.getBaseUrl());
        loginPage.clickContinueAsGuest();

        Assert.assertTrue(uploadPage.isDisplayed(), "User should land on the Upload page after continuing as guest");
    }

    @Test(description = "Verify invalid login attempt displays error notification")
    public void testInvalidLoginCredentialsRejected() {
        LoginPage loginPage = pageObjectManager.getLoginPage();
        loginPage.open(testConfig.getBaseUrl());

        loginPage.loginWithEmailPassword("invaliduser@arkhive.com", "wrongpassword123");

        Assert.assertTrue(loginPage.hasErrorMessage(), "Error alert should be displayed for invalid credentials");
        String errorMsg = loginPage.getErrorMessage();
        Assert.assertFalse(errorMsg.isEmpty(), "Error message should not be empty");
    }

    @Test(description = "Verify registration rejects mismatched passwords with validation error")
    public void testRegistrationPasswordMismatchRejected() {
        LoginPage loginPage = pageObjectManager.getLoginPage();
        loginPage.open(testConfig.getBaseUrl());

        loginPage.register("Test User", "QA", "testuser@arkhive.com", "secretPassword123", "differentPassword123");

        Assert.assertTrue(loginPage.hasErrorMessage(), "Error alert should be displayed when passwords do not match");
        String errorMsg = loginPage.getErrorMessage();
        Assert.assertTrue(errorMsg.contains("Passwords do not match"),
                "Expected 'Passwords do not match' error, but got: " + errorMsg);
    }
}
