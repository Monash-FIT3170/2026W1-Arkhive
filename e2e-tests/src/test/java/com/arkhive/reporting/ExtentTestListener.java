package com.arkhive.reporting;

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

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;
import java.util.concurrent.ConcurrentHashMap;

/**
 * TestNG listener integrating ExtentReports into the test lifecycle.
 *
 * Failure screenshots are saved to disk before the WebDriver is closed.
 * They are embedded as Base64 images in the HTML report, avoiding
 * broken image links caused by relative file paths.
 */
public class ExtentTestListener
        implements ITestListener, IConfigurationListener, ISuiteListener {

    private static final ThreadLocal<Set<String>> configFailedIds =
            ThreadLocal.withInitial(
                    () -> Collections.newSetFromMap(new WeakHashMap<>())
            );

    static final String ATTR_SCREENSHOT_PATH = "extent.screenshot.path";
    static final String ATTR_SCREENSHOT_ATTACHED = "extent.screenshot.attached";
    static final String ATTR_EXTENT_TEST = "extent.test.instance";

    private static final Map<String, ExtentTest> testMap =
            new ConcurrentHashMap<>();

    // ── Suite / Context hooks ──────────────────────────────────────

    @Override
    public void onStart(ISuite suite) {
        ExtentManager.getInstance();
    }

    @Override
    public void onFinish(ISuite suite) {
        ExtentManager.flush();
        testMap.clear();
    }

    @Override
    public void onStart(ITestContext context) {
        ExtentManager.getInstance();
    }

    @Override
    public void onFinish(ITestContext context) {
        ExtentManager.flush();
    }

    // ── Configuration hooks ───────────────────────────────────────

    @Override
    public void beforeConfiguration(ITestResult tr, ITestNGMethod tm) {
        if (tm != null && tm.isTest()
                && tr.getMethod() != null
                && tr.getMethod().isBeforeMethodConfiguration()) {

            ExtentTest test = ensureTestCreated(tm);
            tr.setAttribute(ATTR_EXTENT_TEST, test);
        }
    }

    @Override
    public void onConfigurationFailure(ITestResult tr, ITestNGMethod tm) {
        if (tm == null || !tm.isTest()) {
            return;
        }

        ExtentTest test = ensureTestCreated(tm);
        tr.setAttribute(ATTR_EXTENT_TEST, test);

        String configName = tr.getMethod() != null
                ? tr.getMethod().getMethodName()
                : "configuration";

        String errorMsg = tr.getThrowable() != null
                ? tr.getThrowable().getMessage()
                : "unknown error";

        ReportLogger.fail(
                "Setup failed in " + configName + "(): " + errorMsg
        );

        if (tr.getThrowable() != null) {
            test.fail(tr.getThrowable());
        }

        // Capture a screenshot if the driver was initialized.
        Object instance = tr.getInstance();

        if (instance instanceof com.arkhive.tests.BaseTest baseTest) {
            WebDriver driver = baseTest.getDriver();

            if (driver != null) {
                captureScreenshotForResult(tr, driver);

                String screenshotRelPath =
                        (String) tr.getAttribute(ATTR_SCREENSHOT_PATH);

                if (screenshotRelPath != null
                        && !Boolean.TRUE.equals(
                                tr.getAttribute(ATTR_SCREENSHOT_ATTACHED))) {

                    try {
                        test.info(
                                "Setup Failure Screenshot",
                                MediaEntityBuilder
                                        .createScreenCaptureFromBase64String(
                                                screenshotAsBase64(screenshotRelPath)
                                        )
                                        .build()
                        );

                        tr.setAttribute(
                                ATTR_SCREENSHOT_ATTACHED,
                                Boolean.TRUE
                        );
                    } catch (Exception ignored) {
                        // Screenshot attachment must not interrupt reporting.
                    }
                }
            }
        }

        configFailedIds.get().add(qualifiedId(tm));
    }

    // ── Test lifecycle hooks ──────────────────────────────────────

    @Override
    public void onTestStart(ITestResult result) {
        ExtentTest test = ensureTestCreated(result.getMethod());

        result.setAttribute(ATTR_EXTENT_TEST, test);

        ReportLogger.info("Starting test: " + result.getName());
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        ReportLogger.pass("Test passed: " + result.getName());
        cleanup(result.getMethod());
    }

    @Override
    public void onTestFailure(ITestResult result) {
        ExtentTest test = ExtentManager.getTest();

        if (test == null) {
            test = (ExtentTest) result.getAttribute(ATTR_EXTENT_TEST);
        }

        if (test == null && result.getMethod() != null) {
            test = testMap.get(qualifiedId(result.getMethod()));
        }

        if (test == null) {
            test = ensureTestCreated(result.getMethod());
        }

        result.setAttribute(ATTR_EXTENT_TEST, test);

        String errorMsg = result.getThrowable() != null
                ? result.getThrowable().getMessage()
                : "Unknown error";

        ReportLogger.fail(
                "Test failed: " + result.getName() + " - " + errorMsg
        );

        if (result.getThrowable() != null) {
            test.fail(result.getThrowable());
        }

        // Attach a screenshot if it was saved before this callback.
        String screenshotRelPath =
                (String) result.getAttribute(ATTR_SCREENSHOT_PATH);

        Boolean attached =
                (Boolean) result.getAttribute(ATTR_SCREENSHOT_ATTACHED);

        if (screenshotRelPath != null && !Boolean.TRUE.equals(attached)) {
            try {
                test.info(
                        "Failure Screenshot",
                        MediaEntityBuilder
                                .createScreenCaptureFromBase64String(
                                        screenshotAsBase64(screenshotRelPath)
                                )
                                .build()
                );

                result.setAttribute(
                        ATTR_SCREENSHOT_ATTACHED,
                        Boolean.TRUE
                );
            } catch (Exception e) {
                ReportLogger.warn(
                        "Failed to attach screenshot to report: "
                                + e.getMessage()
                );
            }
        }

        cleanup(result.getMethod());
    }

    @Override
    public void onTestSkipped(ITestResult result) {
        String id = qualifiedId(result.getMethod());

        if (configFailedIds.get().remove(id)) {
            ExtentTest test = ExtentManager.getTest();

            if (test != null) {
                ReportLogger.warn(
                        "Test skipped: " + result.getName()
                                + " (caused by setup failure above)"
                );

                test.skip(
                        "Test was skipped because @BeforeMethod failed "
                                + "— see failure details above."
                );
            }

            cleanup(result.getMethod());
            return;
        }

        ExtentTest test = ensureTestCreated(result.getMethod());

        if (result.getThrowable() != null) {
            ReportLogger.warn(
                    "Test skipped: " + result.getName()
                            + " - " + result.getThrowable().getMessage()
            );

            test.skip(result.getThrowable());
        } else {
            ReportLogger.warn(
                    "Test skipped: " + result.getName()
            );

            test.skip("Test was skipped");
        }

        cleanup(result.getMethod());
    }

    // ── Screenshot API ────────────────────────────────────────────

    /**
     * Saves a failure screenshot as a PNG and attaches it to the
     * existing ExtentTest entry as an embedded Base64 image.
     *
     * This method does not require an active ThreadLocal ExtentTest
     * to capture and save the screenshot.
     *
     * Must be called before WebDriver is closed.
     */
    public static void captureScreenshotForResult(
            ITestResult result,
            WebDriver driver) {

        if (driver == null) {
            return;
        }

        try {
            if (!(driver instanceof TakesScreenshot takesScreenshot)) {
                return;
            }

            String methodName =
                    result != null && result.getMethod() != null
                            ? result.getMethod().getMethodName()
                            : "test";

            String fileName =
                    methodName + "_" + System.currentTimeMillis() + ".png";

            Path screenshotDir =
                    Path.of("test-output", "screenshots");

            Files.createDirectories(screenshotDir);

            Path screenshotPath = screenshotDir.resolve(fileName);

            // Save the PNG independently of ExtentReports.
            Files.write(
                    screenshotPath,
                    takesScreenshot.getScreenshotAs(OutputType.BYTES)
            );

            String relPath = "screenshots/" + fileName;

            if (result != null) {
                result.setAttribute(ATTR_SCREENSHOT_PATH, relPath);
            }

            // Find the existing report entry even if the ThreadLocal
            // was cleared by an earlier TestNG callback.
            ExtentTest test = ExtentManager.getTest();

            if (test == null && result != null) {
                test = (ExtentTest) result.getAttribute(ATTR_EXTENT_TEST);
            }

            if (test == null
                    && result != null
                    && result.getMethod() != null) {

                test = testMap.get(qualifiedId(result.getMethod()));
            }

            // Embed the screenshot directly in the HTML report.
            if (test != null
                    && result != null
                    && !Boolean.TRUE.equals(
                            result.getAttribute(ATTR_SCREENSHOT_ATTACHED))) {

                test.info(
                        "Failure Screenshot",
                        MediaEntityBuilder
                                .createScreenCaptureFromBase64String(
                                        screenshotAsBase64(relPath)
                                )
                                .build()
                );

                result.setAttribute(
                        ATTR_SCREENSHOT_ATTACHED,
                        Boolean.TRUE
                );
            }

        } catch (Exception e) {
            ReportLogger.warn(
                    "Failed to save failure screenshot: " + e.getMessage()
            );
        }
    }

    /**
     * Reads a saved screenshot and converts it to Base64
     * for embedding directly in the ExtentReports HTML.
     */
    private static String screenshotAsBase64(String relativePath)
            throws IOException {

        Path screenshotPath =
                Path.of("test-output").resolve(relativePath);

        return Base64.getEncoder().encodeToString(
                Files.readAllBytes(screenshotPath)
        );
    }

    // ── Helpers ───────────────────────────────────────────────────

    /**
     * Returns an identifier such as "LoginPageTest.testInvalidLogin".
     */
    private static String qualifiedId(ITestNGMethod method) {
        String className = method.getTestClass() != null
                ? method.getTestClass().getRealClass().getSimpleName()
                : "Unknown";

        return className + "." + method.getMethodName();
    }

    /**
     * Creates or retrieves an ExtentTest entry for a test method.
     */
    private static ExtentTest ensureTestCreated(
            ITestNGMethod testMethod) {

        String id = qualifiedId(testMethod);

        ExtentTest existing = testMap.get(id);

        if (existing != null) {
            ExtentManager.setTest(existing);
            ExtentManager.setTestName(id);
            return existing;
        }

        if (ExtentManager.getTest() != null
                && id.equals(ExtentManager.getTestName())) {

            testMap.put(id, ExtentManager.getTest());
            return ExtentManager.getTest();
        }

        String description = testMethod.getDescription();

        String displayName = testMethod.getTestClass() != null
                ? testMethod.getTestClass().getRealClass().getSimpleName()
                        + " › " + testMethod.getMethodName()
                : testMethod.getMethodName();

        ExtentTest test =
                ExtentManager.createTest(displayName, id, description);

        testMap.put(id, test);

        return test;
    }

    /**
     * Clears the ThreadLocal reporting context after a test finishes.
     */
    private void cleanup(ITestNGMethod method) {
        ExtentManager.removeTest();
    }
}
