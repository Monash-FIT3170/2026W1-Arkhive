package com.arkhive.tests;

import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.Test;

public class NavbarComponentTest extends BaseTest {

    @Test(description = "Verify navigating to Quick Scan / Upload using the navbar Quick Scan tab")
    public void testNavbarNavigateToQuickScan() {
        loginAsGuest();

        navbarComponent.clickHome();
        navbarComponent.clickQuickScan();

        Assert.assertTrue(uploadPage.isDisplayed(),
                "User should be on Upload page after clicking Quick Scan in navbar");
    }

    @Test(description = "Verify theme toggle controller is present and interactive in the navbar")
    public void testThemeToggleInNavbar() {
        loginAsGuest();

        Assert.assertTrue(navbarComponent.isThemeToggleDisplayed(), "Theme toggle controller should be present in navbar");
        navbarComponent.toggleTheme();
    }

    @Test(description = "Verify that Projects navigation is visible and functional for a registered user")
    public void testProjectsNavForRegisteredUser() {
        if (testConfig.getTestUserEmail().isEmpty() || testConfig.getTestUserPassword().isEmpty()) {
            throw new SkipException("Registered user credentials not configured. Skipping test.");
        }

        loginAsUser(testConfig.getTestUserEmail(), testConfig.getTestUserPassword());

        Assert.assertTrue(navbarComponent.isProjectsNavDisplayed(),
                "Projects tab should be visible in navbar for authenticated registered user");
        navbarComponent.clickProjects();

        Assert.assertTrue(projectsPage.isDisplayed(),
                "Clicking Projects in navbar should navigate to Projects page");
    }

    @Test(description = "Verify user profile dropdown visibility and sign-out functionality")
    public void testUserProfileAndSignOut() {
        if (testConfig.getTestUserEmail().isEmpty() || testConfig.getTestUserPassword().isEmpty()) {
            throw new SkipException("Registered user credentials not configured. Skipping test.");
        }

        loginAsUser(testConfig.getTestUserEmail(), testConfig.getTestUserPassword());

        Assert.assertTrue(navbarComponent.isAuthenticatedUserDisplayed(),
                "User profile avatar button should be visible in navbar for registered user");

        navbarComponent.signOut();

        Assert.assertTrue(loginPage.isDisplayed(),
                "User should be redirected to Login page after signing out from navbar profile menu");
    }
}
