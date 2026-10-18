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
import org.testng.ITestResult;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.stream.Stream;

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
    protected Path downloadDir;

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

        try {
            downloadDir = Files.createTempDirectory("arkhive-downloads-");
        } catch (IOException e) {
            downloadDir = Path.of(System.getProperty("java.io.tmpdir"), "arkhive-downloads");
        }

        driverManager = new DriverManager(testConfig, downloadDir);
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

    /**
     * Tears down the test session. Accepts {@code ITestResult} so that a failure
     * screenshot can be captured <em>before</em> the WebDriver session is closed.
     *
     * <p>TestNG injects {@code ITestResult} automatically when it is declared as
     * the sole parameter of an {@code @AfterMethod}. The TestNG event ordering is:
     * {@code @AfterMethod} fires first, then {@code ITestListener.onTestFailure()}.
     * As a result, {@code onTestFailure()} cannot capture screenshots because the
     * driver is already closed by then. We capture them here instead.
     */
    @AfterMethod(alwaysRun = true)
    public void tearDown(ITestResult result) {
        try {
            // Capture screenshot while the browser is still open, before quitDriver().
            // ExtentTestListener.onTestFailure() fires after this method returns,
            // at which point the driver is no longer available.
            if (result.getStatus() == ITestResult.FAILURE && driver != null) {
                com.arkhive.reporting.ExtentTestListener.captureScreenshotForResult(result, driver);
            }
        } catch (Exception ignored) {
            // Never allow screenshot capture to prevent WebDriver teardown.
        }

        try {
            if (driverManager != null) {
                driverManager.quitDriver();
            }
        } finally {
            cleanupDownloadDir();

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

    private void cleanupDownloadDir() {
        if (downloadDir != null && Files.exists(downloadDir)) {
            try (Stream<Path> stream = Files.walk(downloadDir)) {
                stream.sorted(Comparator.reverseOrder())
                      .map(Path::toFile)
                      .forEach(File::delete);
            } catch (Exception ignored) {
            } finally {
                downloadDir = null;
            }
        }
    }

    public Path getDownloadDir() {
        return downloadDir;
    }

    public WebDriver getDriver() {
        return driver;
    }
}
