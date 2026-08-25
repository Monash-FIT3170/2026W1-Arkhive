package com.arkhive.driver;

import com.arkhive.config.TestConfig;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;

/**
 * Manages the creation and lifecycle of the WebDriver instance using configuration from TestConfig.
 */
public class DriverManager {

    private final TestConfig config;
    private WebDriver driver;

    public DriverManager(TestConfig config) {
        this.config = config != null ? config : new TestConfig();
    }

    public DriverManager() {
        this(new TestConfig());
    }

    public void initializeDriver() {
        System.setProperty("webdriver.chrome.silentOutput", "true");
        java.util.logging.Logger.getLogger("org.openqa.selenium").setLevel(java.util.logging.Level.SEVERE);

        ChromeOptions options = new ChromeOptions();

        if (config.isHeadless()) {
            options.addArguments("--headless=new");
        }

        options.addArguments("--remote-allow-origins=*");
        options.addArguments("--no-sandbox");
        options.addArguments("--disable-dev-shm-usage");

        driver = new ChromeDriver(options);
        driver.manage().window().maximize();
    }

    public WebDriver getDriver() {
        if (driver == null) {
            throw new IllegalStateException("WebDriver has not been initialized. Call initializeDriver() first.");
        }
        return driver;
    }

    public void quitDriver() {
        if (driver != null) {
            try {
                driver.quit();
            } finally {
                driver = null;
            }
        }
    }
}
