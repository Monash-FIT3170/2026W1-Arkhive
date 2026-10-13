package com.arkhive.reporting;

import com.arkhive.tests.BaseTest;
import com.aventstack.extentreports.ExtentTest;
import com.aventstack.extentreports.MediaEntityBuilder;
import org.openqa.selenium.OutputType;
import org.openqa.selenium.TakesScreenshot;
import org.openqa.selenium.WebDriver;
import org.testng.IConfigurationListener;
import org.testng.ISuite;
import org.testng.ISuiteListener;
import org.testng.ITestContext;
import org.testng.ITestListener;
import org.testng.ITestNGMethod;
import org.testng.ITestResult;

import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Custom TestNG listener integrating ExtentReports into the test execution lifecycle.
 * Captures test and setup methods, records action timelines, captures failure screenshots,
 * and flushes report upon execution completion.
 */
public class ExtentTestListener implements ITestListener, IConfigurationListener, ISuiteListener {

    @Override
    public void onStart(ISuite suite) {
        ExtentManager.getInstance();
    }

    @Override
    public void onFinish(ISuite suite) {
        ExtentManager.flush();
    }

    @Override
    public void onStart(ITestContext context) {
        ExtentManager.getInstance();
    }

    @Override
    public void onFinish(ITestContext context) {
        ExtentManager.flush();
    }

    /**
     * Intercepts configuration methods (e.g. @BeforeMethod) before they execute.
     * Ensures that when BaseTest.setUp() or test-specific @BeforeMethod (e.g. loginAsGuest)
     * runs, an ExtentTest entry is already created and bound to the current thread.
     */
    @Override
    public void beforeConfiguration(ITestResult tr, ITestNGMethod tm) {
        if (tm != null && tm.isTest()) {
            ensureTestCreated(tm);
        }
    }

    @Override
    public void onConfigurationFailure(ITestResult tr, ITestNGMethod tm) {
        ExtentTest test = ExtentManager.getTest();
        if (test == null && tm != null) {
            test = ensureTestCreated(tm);
        }
        if (test != null) {
            String configName = tr.getMethod() != null ? tr.getMethod().getMethodName() : "Configuration";
            String errorMessage = tr.getThrowable() != null ? tr.getThrowable().getMessage() : "Unknown configuration error";
            ReportLogger.fail("Configuration failed in " + configName + ": " + errorMessage);
            attachScreenshot(tr, test);
            if (tr.getThrowable() != null) {
                test.fail(tr.getThrowable());
            }
        }
    }

    @Override
    public void onTestStart(ITestResult result) {
        ensureTestCreated(result.getMethod());
        ReportLogger.info("Starting test: " + result.getName());
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        ReportLogger.pass("Test passed: " + result.getName());
        ExtentManager.removeTest();
    }

    @Override
    public void onTestFailure(ITestResult result) {
        ExtentTest test = ExtentManager.getTest();
        if (test == null) {
            test = ensureTestCreated(result.getMethod());
        }
        String errorMessage = result.getThrowable() != null ? result.getThrowable().getMessage() : "Unknown error";
        ReportLogger.fail("Test failed: " + result.getName() + " - " + errorMessage);
        attachScreenshot(result, test);
        if (result.getThrowable() != null) {
            test.fail(result.getThrowable());
        }
        ExtentManager.removeTest();
    }

    @Override
    public void onTestSkipped(ITestResult result) {
        ExtentTest test = ExtentManager.getTest();
        if (test == null) {
            test = ensureTestCreated(result.getMethod());
        }
        if (result.getThrowable() != null) {
            ReportLogger.warn("Test skipped: " + result.getName() + " - " + result.getThrowable().getMessage());
            test.skip(result.getThrowable());
        } else {
            ReportLogger.warn("Test skipped: " + result.getName());
            test.skip("Test was skipped");
        }
        ExtentManager.removeTest();
    }

    private ExtentTest ensureTestCreated(ITestNGMethod testMethod) {
        String testName = testMethod.getMethodName();
        String currentName = ExtentManager.getTestName();
        if (ExtentManager.getTest() != null && testName.equals(currentName)) {
            return ExtentManager.getTest();
        }
        String description = testMethod.getDescription();
        return ExtentManager.createTest(testName, description);
    }

    private void attachScreenshot(ITestResult result, ExtentTest test) {
        try {
            Object instance = result.getInstance();
            WebDriver driver = null;
            if (instance instanceof BaseTest baseTest) {
                driver = baseTest.getDriver();
            }
            if (driver instanceof TakesScreenshot takesScreenshot) {
                byte[] screenshotBytes = takesScreenshot.getScreenshotAs(OutputType.BYTES);
                String testName = result.getMethod() != null ? result.getMethod().getMethodName() : "test";
                String fileName = testName + "_" + System.currentTimeMillis() + ".png";

                Path screenshotDir = Path.of("test-output", "screenshots");
                Files.createDirectories(screenshotDir);
                Path screenshotPath = screenshotDir.resolve(fileName);
                Files.write(screenshotPath, screenshotBytes);

                test.info("Failure Screenshot",
                        MediaEntityBuilder.createScreenCaptureFromPath("screenshots/" + fileName).build());
            }
        } catch (Exception e) {
            ReportLogger.warn("Failed to capture screenshot: " + e.getMessage());
        }
    }
}
