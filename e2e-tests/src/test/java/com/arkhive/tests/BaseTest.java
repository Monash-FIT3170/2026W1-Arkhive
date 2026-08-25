package com.arkhive.tests;

import com.arkhive.driver.DriverManager;
import com.arkhive.managers.PageObjectManager;
import org.openqa.selenium.WebDriver;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;

/**
 * Base test class owning the TestNG test lifecycle, browser setup, and PageObjectManager initialization.
 */
public abstract class BaseTest {

    protected DriverManager driverManager;
    protected WebDriver driver;
    protected PageObjectManager pageObjectManager;

    @BeforeMethod
    public void setUp() {
        driverManager = new DriverManager();
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
