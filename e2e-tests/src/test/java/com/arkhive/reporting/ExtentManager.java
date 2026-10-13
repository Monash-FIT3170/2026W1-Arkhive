package com.arkhive.reporting;

import com.aventstack.extentreports.ExtentReports;
import com.aventstack.extentreports.ExtentTest;
import com.aventstack.extentreports.reporter.ExtentSparkReporter;
import com.aventstack.extentreports.reporter.configuration.Theme;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import java.io.File;

/**
 * Thread-safe singleton managing the ExtentReports lifecycle, reporter
 * configuration,
 * and ThreadLocal association with running tests.
 */
public class ExtentManager {

    private static final String TIMESTAMP = LocalDateTime.now()
            .format(DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss-SSS"));

    private static final String REPORT_PATH = "test-output/extent-report_" + TIMESTAMP + ".html";
    private static ExtentReports extent;
    private static final ThreadLocal<ExtentTest> currentTest = new ThreadLocal<>();
    private static final ThreadLocal<String> currentTestName = new ThreadLocal<>();

    public static synchronized ExtentReports getInstance() {
        if (extent == null) {
            new File("test-output/screenshots").mkdirs();

            ExtentSparkReporter spark = new ExtentSparkReporter(REPORT_PATH);
            spark.config().setDocumentTitle("Arkhive E2E Test Report");
            spark.config().setReportName("Arkhive Automation Execution Report");
            spark.config().setTheme(Theme.STANDARD);
            spark.config().setTimeStampFormat("yyyy-MM-dd HH:mm:ss.SSS");

            extent = new ExtentReports();
            extent.attachReporter(spark);
            extent.setSystemInfo("Operating System", System.getProperty("os.name"));
            extent.setSystemInfo("Java Version", System.getProperty("java.version"));
            extent.setSystemInfo("Framework", "Selenium WebDriver & TestNG");
            extent.setSystemInfo("Browser", "Google Chrome");
        }
        return extent;
    }

    public static synchronized void flush() {
        if (extent != null) {
            extent.flush();
        }
    }

    public static ExtentTest getTest() {
        return currentTest.get();
    }

    public static void setTest(ExtentTest test) {
        currentTest.set(test);
    }

    public static String getTestName() {
        return currentTestName.get();
    }

    public static void setTestName(String testName) {
        currentTestName.set(testName);
    }

    public static ExtentTest createTest(String displayName, String description) {
        return createTest(displayName, displayName, description);
    }

    /**
     * Creates an ExtentTest entry displayed as {@code displayName} in the HTML
     * report,
     * but tracked internally by {@code qualifiedId} (typically
     * {@code "ClassName.methodName"})
     * to support reliable deduplication even when test methods share the same
     * simple name.
     *
     * @param displayName human-readable label shown in the HTML report
     * @param qualifiedId unique key stored in the ThreadLocal for deduplication
     *                    checks
     * @param description optional test description (may be null or empty)
     */
    public static ExtentTest createTest(String displayName, String qualifiedId, String description) {
        ExtentReports reports = getInstance();
        ExtentTest test;
        if (description != null && !description.trim().isEmpty()) {
            test = reports.createTest(displayName, description);
        } else {
            test = reports.createTest(displayName);
        }
        setTest(test);
        setTestName(qualifiedId);
        return test;
    }

    public static void removeTest() {
        currentTest.remove();
        currentTestName.remove();
    }
}
