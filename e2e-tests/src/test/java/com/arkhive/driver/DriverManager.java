package com.arkhive.driver;

import com.arkhive.config.TestConfig;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * Manages the creation and lifecycle of the WebDriver instance using configuration from TestConfig.
 */
public class DriverManager {

    private final TestConfig config;
    private final Path downloadDirectory;
    private WebDriver driver;

    public DriverManager(TestConfig config, Path downloadDirectory) {
        this.config = config != null ? config : new TestConfig();
        this.downloadDirectory = downloadDirectory;
    }

    public DriverManager(TestConfig config) {
        this(config, null);
    }

    public DriverManager() {
        this(new TestConfig(), null);
    }

    public void initializeDriver() {
        System.setProperty("webdriver.chrome.silentOutput", "true");
        java.util.logging.Logger.getLogger("org.openqa.selenium").setLevel(java.util.logging.Level.SEVERE);

        ChromeOptions options = new ChromeOptions();

        if (downloadDirectory != null) {
            Map<String, Object> prefs = new HashMap<>();
            prefs.put("download.default_directory", downloadDirectory.toAbsolutePath().toString());
            prefs.put("download.prompt_for_download", false);
            prefs.put("download.directory_upgrade", true);
            prefs.put("safebrowsing.enabled", true);
            options.setExperimentalOption("prefs", prefs);
        }

        if (config.isHeadless()) {
            options.addArguments("--headless=new");
        }

        options.addArguments("--remote-allow-origins=*");
        options.addArguments("--no-sandbox");
        options.addArguments("--disable-dev-shm-usage");

        driver = new ChromeDriver(options);
        driver.manage().window().maximize();
    }

    public Path getDownloadDirectory() {
        return downloadDirectory;
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
