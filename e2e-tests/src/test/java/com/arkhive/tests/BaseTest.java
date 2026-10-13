package com.arkhive.tests;

import com.arkhive.config.TestConfig;
import com.arkhive.driver.DriverManager;
import com.arkhive.managers.PageObjectManager;
import com.arkhive.pages.DocumentPreviewPage;
import com.arkhive.pages.HomePage;
import com.arkhive.pages.LoginPage;
import com.arkhive.pages.MobileCapturePage;
import com.arkhive.pages.ProjectWorkspacePage;
import com.arkhive.pages.ProjectsPage;
import com.arkhive.pages.UploadPage;
import com.arkhive.pages.ValidationPage;
import com.arkhive.pages.components.ChatPanelComponent;
import com.arkhive.pages.components.ExportModalComponent;
import com.arkhive.pages.components.NavbarComponent;
import com.arkhive.utils.TestFileUtils;
import org.openqa.selenium.WebDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

/**
 * Base test class owning the TestNG test lifecycle, browser setup, configuration,
 * PageObjectManager initialization, and centralized Page Object reference initialization.
 */
public abstract class BaseTest {

    protected TestConfig testConfig;
    protected TestFileUtils testFileUtils;
    protected DriverManager driverManager;
    protected WebDriver driver;
    protected PageObjectManager pageObjectManager;

    // Centralized Page Object references
    protected HomePage homePage;
    protected LoginPage loginPage;
    protected UploadPage uploadPage;
    protected DocumentPreviewPage documentPreviewPage;
    protected ValidationPage validationPage;
    protected ProjectsPage projectsPage;
    protected ProjectWorkspacePage projectWorkspacePage;
    protected MobileCapturePage mobileCapturePage;

    // Centralized Component Object references
    protected NavbarComponent navbarComponent;
    protected ExportModalComponent exportModalComponent;
    protected ChatPanelComponent chatPanelComponent;

    @BeforeMethod
    public void setUp() {
        testConfig = new TestConfig();
        testFileUtils = new TestFileUtils(testConfig);
        driverManager = new DriverManager(testConfig);
        driverManager.initializeDriver();
        driver = driverManager.getDriver();
        pageObjectManager = new PageObjectManager(driver);

        pageLoad();
    }

    /**
     * Centralized initialization of all Page and Component Objects
     * using the active test session's PageObjectManager.
     */
    protected void pageLoad() {
        homePage = pageObjectManager.getHomePage();
        loginPage = pageObjectManager.getLoginPage();
        uploadPage = pageObjectManager.getUploadPage();
        documentPreviewPage = pageObjectManager.getDocumentPreviewPage();
        validationPage = pageObjectManager.getValidationPage();
        projectsPage = pageObjectManager.getProjectsPage();
        projectWorkspacePage = pageObjectManager.getProjectWorkspacePage();
        mobileCapturePage = pageObjectManager.getMobileCapturePage();

        navbarComponent = pageObjectManager.getNavbarComponent();
        exportModalComponent = pageObjectManager.getExportModalComponent();
        chatPanelComponent = pageObjectManager.getChatPanelComponent();
    }

    /**
     * Explicit authentication helper for tests requiring guest mode access.
     */
    protected void loginAsGuest() {
        loginPage.loginAsGuest(testConfig.getBaseUrl());
    }

    /**
     * Explicit authentication helper for tests requiring registered user access.
     */
    protected void loginAsUser(String email, String password) {
        loginPage.open(testConfig.getBaseUrl());
        loginPage.loginWithEmailPassword(email, password);
    }

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        try {
            if (driverManager != null) {
                driverManager.quitDriver();
            }
        } finally {
            driverManager = null;
            driver = null;
            pageObjectManager = null;

            homePage = null;
            loginPage = null;
            uploadPage = null;
            documentPreviewPage = null;
            validationPage = null;
            projectsPage = null;
            projectWorkspacePage = null;
            mobileCapturePage = null;

            navbarComponent = null;
            exportModalComponent = null;
            chatPanelComponent = null;
        }
    }
}
