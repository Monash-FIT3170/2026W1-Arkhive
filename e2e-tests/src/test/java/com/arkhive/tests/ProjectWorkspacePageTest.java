package com.arkhive.tests;

import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.util.UUID;

public class ProjectWorkspacePageTest extends BaseTest {

    private String currentProjectName;

    @BeforeMethod
    public void setupWorkspaceTest() {
        if (testConfig.getTestUserEmail().isEmpty() || testConfig.getTestUserPassword().isEmpty()) {
            throw new SkipException("Registered user credentials not configured in TestConfig. Skipping ProjectWorkspacePageTest.");
        }
        loginAsUser(testConfig.getTestUserEmail(), testConfig.getTestUserPassword());

        currentProjectName = "E2E-WS-" + UUID.randomUUID().toString().substring(0, 8);
        projectsPage.open(testConfig.getBaseUrl());
        projectsPage.createNewProject(currentProjectName);
        projectsPage.openProject(currentProjectName);
    }

    @Test(description = "Verify that the Project Workspace displays the correct project name breadcrumb")
    public void testProjectNameBreadcrumbMatches() {
        Assert.assertEquals(projectWorkspacePage.getProjectName(), currentProjectName,
                "Breadcrumb project name should match the project opened during setup");
    }

    @Test(description = "Verify navigating back from the Project Workspace to the Projects list")
    public void testNavigateBackToProjects() {
        projectWorkspacePage.clickBackToProjects();

        Assert.assertTrue(projectsPage.isDisplayed(10),
                "User should be navigated back to Projects page after clicking Back to Projects");
    }

    @Test(description = "Verify tab switching between Files and Validate when documents are present")
    public void testSwitchBetweenFilesAndValidateTabs() {
        if (!projectWorkspacePage.isTabsBarDisplayed()) {
            throw new SkipException("Files/Validate tabs are rendered conditionally when project contains processed documents. Skipping tab switching on empty project.");
        }

        projectWorkspacePage.switchToValidateTab();
        Assert.assertTrue(projectWorkspacePage.isValidateTabActive(), "Validate tab should be active after switching");

        projectWorkspacePage.switchToFilesTab();
        Assert.assertTrue(projectWorkspacePage.isFilesTabActive(), "Files tab should be active after switching back");
    }

    @AfterMethod(alwaysRun = true)
    public void cleanupWorkspaceProject() {
        if (driver != null && pageObjectManager != null && currentProjectName != null) {
            try {
                projectsPage.open(testConfig.getBaseUrl());
                if (projectsPage.hasProject(currentProjectName)) {
                    projectsPage.deleteProject(currentProjectName);
                }
            } catch (Exception ignored) {
            } finally {
                currentProjectName = null;
            }
        }
    }
}
