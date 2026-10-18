package com.arkhive.tests;

import org.testng.Assert;
import org.testng.SkipException;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class ProjectsPageTest extends BaseTest {

    private final List<String> testProjects = new ArrayList<>();

    @BeforeMethod
    public void setupRegisteredUserSession() {
        if (testConfig.getTestUserEmail().isEmpty() || testConfig.getTestUserPassword().isEmpty()) {
            throw new SkipException("Registered user credentials not configured in TestConfig. Skipping ProjectsPageTest.");
        }
        loginAsUser(testConfig.getTestUserEmail(), testConfig.getTestUserPassword());
    }

    private String generateProjectName() {
        return "E2E-" + UUID.randomUUID().toString().substring(0, 8);
    }

    @Test(description = "Verify that the Projects page is displayed for an authenticated user")
    public void testProjectsPageDisplayed() {
        projectsPage.open(testConfig.getBaseUrl());

        Assert.assertTrue(projectsPage.isDisplayed(), "Projects page heading should be visible");
    }

    @Test(description = "Verify that a new project can be created and found in the projects list")
    public void testCreateAndFindProject() {
        projectsPage.open(testConfig.getBaseUrl());

        String projectName = generateProjectName();
        testProjects.add(projectName);

        projectsPage.createNewProject(projectName);
        Assert.assertTrue(projectsPage.hasProject(projectName),
                "Newly created project '" + projectName + "' should be displayed in the project grid");
    }

    @Test(description = "Verify that opening a project navigates to its Project Workspace")
    public void testOpenProject() {
        projectsPage.open(testConfig.getBaseUrl());
        String projectName = generateProjectName();
        testProjects.add(projectName);

        projectsPage.createNewProject(projectName);
        projectsPage.openProject(projectName);

        Assert.assertTrue(projectWorkspacePage.isDisplayed(10), "Project workspace should be displayed after opening project");
        Assert.assertEquals(projectWorkspacePage.getProjectName(), projectName,
                "Breadcrumb project name should match the opened project");
    }

    @Test(description = "Verify that a project can be renamed successfully")
    public void testRenameProject() {
        projectsPage.open(testConfig.getBaseUrl());

        String initialName = generateProjectName();
        String updatedName = initialName + "-Renamed";
        testProjects.add(initialName);
        testProjects.add(updatedName);

        projectsPage.createNewProject(initialName);
        Assert.assertTrue(projectsPage.hasProject(initialName), "Initial project should exist");

        projectsPage.renameProject(initialName, updatedName);

        Assert.assertTrue(projectsPage.hasProject(updatedName),
                "Project with updated name '" + updatedName + "' should exist");
        Assert.assertFalse(projectsPage.hasProject(initialName),
                "Project with old name '" + initialName + "' should no longer be listed");
    }

    @Test(description = "Verify that a project can be deleted via the confirmation modal")
    public void testDeleteProject() {
        projectsPage.open(testConfig.getBaseUrl());

        String projectName = generateProjectName();
        projectsPage.createNewProject(projectName);
        Assert.assertTrue(projectsPage.hasProject(projectName), "Project should exist prior to deletion");

        projectsPage.deleteProject(projectName);

        Assert.assertFalse(projectsPage.hasProject(projectName),
                "Project '" + projectName + "' should be removed after confirmed deletion");
    }

    @Test(description = "Verify that cancelling project deletion retains the project in the list")
    public void testCancelProjectDeletion() {
        projectsPage.open(testConfig.getBaseUrl());

        String projectName = generateProjectName();
        testProjects.add(projectName);

        projectsPage.createNewProject(projectName);
        Assert.assertTrue(projectsPage.hasProject(projectName), "Project should exist prior to delete request");

        projectsPage.cancelDeleteProject(projectName);

        Assert.assertTrue(projectsPage.hasProject(projectName),
                "Project should remain present after cancelling deletion");
    }

    @Test(description = "Verify that the Create Project button is disabled when project name input is empty")
    public void testEmptyProjectNameValidation() {
        projectsPage.open(testConfig.getBaseUrl());

        projectsPage.enterProjectName("");

        Assert.assertFalse(projectsPage.isCreateButtonEnabled(),
                "Create Project button should be disabled when the project name is blank");
    }

    @AfterMethod(alwaysRun = true)
    public void cleanupTestProjects() {
        if (driver != null && pageObjectManager != null && !testProjects.isEmpty()) {
            try {
                projectsPage.open(testConfig.getBaseUrl());
                for (String projectName : testProjects) {
                    if (projectsPage.hasProject(projectName)) {
                        projectsPage.deleteProject(projectName);
                    }
                }
            } catch (Exception ignored) {
            } finally {
                testProjects.clear();
            }
        }
    }
}
