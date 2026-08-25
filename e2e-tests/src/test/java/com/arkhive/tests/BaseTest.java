package com.arkhive.tests;

import com.arkhive.config.TestConfig;
import com.arkhive.driver.DriverManager;
import com.arkhive.managers.PageObjectManager;
import com.arkhive.utils.TestFileUtils;
import org.openqa.selenium.WebDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

/**
 * Base test class owning the TestNG test lifecycle, browser setup, configuration, and PageObjectManager initialization.
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
        testFileUtils = new TestFileUtils();
        driverManager = new DriverManager(testConfig);
        driverManager.initializeDriver();
        driver = driverManager.getDriver();
        pageObjectManager = new PageObjectManager(driver);
    }

    @AfterMethod
    public void tearDown() {
        if (driverManager != null) {
            driverManager.quitDriver();
        }
    }
}
