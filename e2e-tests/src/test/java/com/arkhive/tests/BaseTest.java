package com.arkhive.tests;

import com.arkhive.config.TestConfig;
import com.arkhive.driver.DriverManager;
import com.arkhive.managers.PageObjectManager;
import com.arkhive.utils.TestFileUtils;
import org.openqa.selenium.WebDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

/**
 * Base test class owning the TestNG test lifecycle, browser setup, configuration,
 * PageObjectManager initialization, and common guest mode authentication setup.
 */
public abstract class BaseTest {

    protected TestConfig testConfig;
    protected TestFileUtils testFileUtils;
    protected DriverManager driverManager;
    protected WebDriver driver;
    protected PageObjectManager pageObjectManager;

    @BeforeMethod
    public void setUp() {
        testConfig = new TestConfig();
        testFileUtils = new TestFileUtils(testConfig);
        driverManager = new DriverManager(testConfig);
        driverManager.initializeDriver();
        driver = driverManager.getDriver();
        pageObjectManager = new PageObjectManager(driver);

        // Common setup: Navigate and enter guest mode for all tests
        pageObjectManager.getLoginPage().loginAsGuest(testConfig.getBaseUrl());
    }

    @AfterMethod(alwaysRun = true)
    public void tearDown() {
        if (driverManager != null) {
            driverManager.quitDriver();
            driverManager = null;
        }
        driver = null;
        pageObjectManager = null;
    }
}
