package com.arkhive.tests;

import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.Test;

public class HomePageTest extends BaseTest {

    @Test(description = "Verify navigating from Home to Upload page via the standalone upload card")
    public void testNavigateFromHomeToUpload() {
        loginAsGuest();
        homePage.open(testConfig.getBaseUrl());
        homePage.clickUploadWithoutProject();

        Assert.assertTrue(uploadPage.isDisplayed(),
                "Upload page dropzone should be displayed after clicking 'Upload Without a Project'");
    }

    @Test(description = "Verify navigating from Home to Projects page for an authenticated registered user")
    public void testNavigateFromHomeToProjectsForRegisteredUser() {
        if (testConfig.getTestUserEmail().isEmpty() || testConfig.getTestUserPassword().isEmpty()) {
            throw new SkipException("Registered user credentials not configured. Skipping test.");
        }

        loginAsUser(testConfig.getTestUserEmail(), testConfig.getTestUserPassword());
        homePage.open(testConfig.getBaseUrl());
        homePage.clickCreateProject();

        Assert.assertTrue(projectsPage.isDisplayed(),
                "Projects page should be displayed after clicking 'Create a Project' as a registered user");
    }
}
