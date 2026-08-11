package com.arkhive.tests;

import com.arkhive.pages.UploadPage;
import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.chrome.ChromeOptions;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.testng.Assert;
import org.testng.annotations.AfterMethod;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.time.Duration;

public class UploadPageTest {

    private WebDriver driver;
    private WebDriverWait wait;
    private static final String APP_URL = "http://localhost:5173";

    @BeforeMethod
    public void setUp() {
        ChromeOptions options = new ChromeOptions();
        // Uncomment line below to run tests headlessly:
        // options.addArguments("--headless=new");
        options.addArguments("--remote-allow-origins=*");

        driver = new ChromeDriver(options);
        driver.manage().window().maximize();
        wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    @Test(description = "Verify that the upload page loads successfully")
    public void testUploadPageLoads() {
        UploadPage uploadPage = new UploadPage(driver);
        uploadPage.open(APP_URL);

        // Wait until page body is rendered
        WebElement body = wait.until(
            ExpectedConditions.visibilityOfElementLocated(By.tagName("body"))
        );

        Assert.assertTrue(body.isDisplayed(), "The upload page should be visible");
    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}
