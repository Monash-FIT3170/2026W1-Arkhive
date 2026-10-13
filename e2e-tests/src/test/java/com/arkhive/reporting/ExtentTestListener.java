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

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;

/**
 * Custom TestNG listener integrating ExtentReports into the test execution lifecycle.
 *
 * <h2>Lifecycle and ordering</h2>
 * <pre>
 *   @BeforeMethod (base)  → beforeConfiguration(tr, tm)  [tm = upcoming @Test]
 *   @BeforeMethod (sub)   → beforeConfiguration(tr, tm)  [same tm; entry reused]
 *   @Test                 → onTestStart → test body → @AfterMethod
 *   @AfterMethod          → BaseTest.tearDown(result)     ← screenshot captured HERE
 *   ITestListener         → onTestSuccess / onTestFailure / onTestSkipped
 * </pre>
 *
 * <h2>Key design decisions</h2>
 * <ul>
 *   <li>Screenshots for test failures are captured inside {@link #captureScreenshotForResult}
 *       which is called by {@code BaseTest.tearDown()} <em>before</em> the WebDriver is closed.
 *       {@code onTestFailure()} fires after {@code @AfterMethod} so the driver is gone by then.</li>
 *   <li>Deduplication uses {@code "ClassName.methodName"} to distinguish tests with identical
 *       method names in different test classes.</li>
 *   <li>When {@code @BeforeMethod} fails, {@code onConfigurationFailure} records the error
 *       and sets a flag so that the subsequent {@code onTestSkipped} can create a separate,
 *       clearly-labelled "skipped due to setup failure" report entry instead of contaminating
 *       the failed setup entry.</li>
 * </ul>
 */
public class ExtentTestListener implements ITestListener, IConfigurationListener, ISuiteListener {

    /**
     * Tracks the qualified test IDs ({@code "ClassName.methodName"}) for which a
     * {@code @BeforeMethod} has already failed on the current thread. Used to distinguish
     * a test skipped because of setup failure from a test intentionally skipped
     * (e.g. via {@link org.testng.SkipException}).
     *
     * <p>Using a {@code ThreadLocal<Set>} keeps this safe for potential parallel execution.
     * The set uses a {@link WeakHashMap} so entries don't accumulate across the suite.
     */
    private static final ThreadLocal<Set<String>> configFailedIds =
            ThreadLocal.withInitial(() -> Collections.newSetFromMap(new WeakHashMap<>()));

    /**
     * Tracks qualified test IDs for which a screenshot has already been saved to disk
     * (by {@link #captureScreenshotForResult}) to avoid attaching a duplicate in
     * {@link #onTestFailure}.
     */
    private static final ThreadLocal<String> screenshotCapturedForId = new ThreadLocal<>();

    // ── Suite / Context hooks ─────────────────────────────────────────────────

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

    // ── Configuration hooks ───────────────────────────────────────────────────

    /**
     * Invoked before a configuration method (e.g. {@code @BeforeMethod}) executes.
     *
     * <p>In TestNG 7.10.2, {@code tm} is the upcoming {@code @Test} method when the
     * configuration method is a {@code @BeforeMethod} (i.e. {@code tm.isTest() == true}).
     * This allows us to pre-create the ExtentTest entry so that any {@link ReportLogger}
     * calls inside setup (e.g. guest login) are attributed to the correct test.
     *
     * <p>This callback fires for <em>every</em> configuration method — including
     * {@code @AfterMethod}. Without filtering on the configuration type, the
     * {@code @AfterMethod} callback (e.g. {@code BaseTest.tearDown()}) fires after
     * {@code onTestSuccess()} has cleared the ThreadLocal via {@code cleanup()}, and
     * {@code ensureTestCreated()} would then produce a second, empty, zero-duration entry.
     *
     * <p>Guard conditions:
     * <ul>
     *   <li>{@code tm != null && tm.isTest()} — {@code tm} is the upcoming {@code @Test};
     *       null or non-test for {@code @BeforeClass}, {@code @BeforeSuite}, etc.</li>
     *   <li>{@code tr.getMethod().isBeforeMethodConfiguration()} — restricts to
     *       {@code @BeforeMethod} callbacks only, excluding {@code @AfterMethod}.</li>
     * </ul>
     */
    @Override
    public void beforeConfiguration(ITestResult tr, ITestNGMethod tm) {
        if (tm != null && tm.isTest()
                && tr.getMethod() != null
                && tr.getMethod().isBeforeMethodConfiguration()) {
            ensureTestCreated(tm);
        }
    }

    /**
     * Invoked when a configuration method (e.g. {@code @BeforeMethod}) fails.
     *
     * <p>We record the failure against the already-created test entry, capture a
     * screenshot while the WebDriver is still active (setup failure means the driver
     * might be open or might not — we attempt it gracefully), and record the qualified
     * test ID in {@link #configFailedIds} so {@link #onTestSkipped} can detect that
     * this skip was caused by a setup failure rather than an intentional skip.
     *
     * <p>We do <em>not</em> call {@link ExtentManager#removeTest()} here because
     * {@code onConfigurationFailure} may fire multiple times if both the base and
     * subclass {@code @BeforeMethod} fail. Cleanup is deferred to {@link #onTestSkipped}.
     */
    @Override
    public void onConfigurationFailure(ITestResult tr, ITestNGMethod tm) {
        if (tm == null || !tm.isTest()) {
            // Not associated with a specific test method — log but do not create an entry.
            return;
        }

        ExtentTest test = ensureTestCreated(tm);

        String configName = tr.getMethod() != null ? tr.getMethod().getMethodName() : "configuration";
        String errorMsg   = tr.getThrowable() != null ? tr.getThrowable().getMessage() : "unknown error";
        ReportLogger.fail("Setup failed in " + configName + "(): " + errorMsg);

        if (tr.getThrowable() != null) {
            test.fail(tr.getThrowable());
        }

        // Attempt screenshot while driver may still be initialised.
        Object instance = tr.getInstance();
        if (instance instanceof com.arkhive.tests.BaseTest baseTest) {
            WebDriver driver = baseTest.getDriver();
            if (driver != null) {
                doSaveScreenshot(tr, test);
            }
        }

        // Record that this test had a config failure so onTestSkipped can handle it correctly.
        configFailedIds.get().add(qualifiedId(tm));
    }

    // ── Test lifecycle hooks ──────────────────────────────────────────────────

    /**
     * Invoked when a test method is about to start.
     *
     * <p>If {@link #beforeConfiguration} already created the entry (normal case when
     * {@code @BeforeMethod} is present), {@link #ensureTestCreated} will detect the
     * matching entry and reuse it. No duplicate is created.
     *
     * <p>If the test class has no {@code @BeforeMethod} (e.g. {@link com.arkhive.tests.LoginPageTest}),
     * this call creates the entry for the first time.
     */
    @Override
    public void onTestStart(ITestResult result) {
        ensureTestCreated(result.getMethod());
        ReportLogger.info("Starting test: " + result.getName());
    }

    @Override
    public void onTestSuccess(ITestResult result) {
        ReportLogger.pass("Test passed: " + result.getName());
        cleanup(result.getMethod());
    }

    /**
     * Invoked when a test method fails.
     *
     * <p>The screenshot has already been captured by {@link #captureScreenshotForResult}
     * (called from {@code BaseTest.tearDown()} before the WebDriver closed). We only
     * attach it here if it was already saved; we do not attempt a new screenshot.
     */
    @Override
    public void onTestFailure(ITestResult result) {
        ExtentTest test = ExtentManager.getTest();
        if (test == null) {
            test = ensureTestCreated(result.getMethod());
        }

        String errorMsg = result.getThrowable() != null ? result.getThrowable().getMessage() : "Unknown error";
        ReportLogger.fail("Test failed: " + result.getName() + " - " + errorMsg);

        if (result.getThrowable() != null) {
            test.fail(result.getThrowable());
        }

        // Note: screenshot was captured in BaseTest.tearDown() before driver was closed.
        // We do NOT attempt another screenshot here because the driver is already gone.

        cleanup(result.getMethod());
    }

    /**
     * Invoked when a test method is skipped.
     *
     * <p>Two distinct cases:
     * <ol>
     *   <li><strong>Intentional skip</strong> (e.g. {@link org.testng.SkipException}):
     *       The entry may or may not already exist. We create/reuse it and record the skip.</li>
     *   <li><strong>Skip caused by setup failure</strong>: {@link #configFailedIds} already
     *       contains this test's ID, meaning the setup failure was already recorded on the
     *       existing report entry. In this case we record a brief note and clean up, avoiding
     *       a duplicate entry.</li>
     * </ol>
     */
    @Override
    public void onTestSkipped(ITestResult result) {
        String id = qualifiedId(result.getMethod());

        if (configFailedIds.get().remove(id)) {
            // Skip is a consequence of a recorded setup failure — annotate the existing entry.
            ExtentTest test = ExtentManager.getTest();
            if (test != null) {
                ReportLogger.warn("Test skipped: " + result.getName() + " (caused by setup failure above)");
                test.skip("Test was skipped because @BeforeMethod failed — see failure details above.");
            }
            cleanup(result.getMethod());
            return;
        }

        // Intentional skip — create or reuse entry and record it.
        ExtentTest test = ensureTestCreated(result.getMethod());
        if (result.getThrowable() != null) {
            ReportLogger.warn("Test skipped: " + result.getName() + " - " + result.getThrowable().getMessage());
            test.skip(result.getThrowable());
        } else {
            ReportLogger.warn("Test skipped: " + result.getName());
            test.skip("Test was skipped");
        }
        cleanup(result.getMethod());
    }

    // ── Screenshot API ────────────────────────────────────────────────────────

    /**
     * Captures a failure screenshot and attaches it to the active {@link ExtentTest} entry.
     *
     * <p>This method is {@code public static} so that {@code BaseTest.tearDown()} can call
     * it before closing the WebDriver. It <em>must</em> be called while the driver is still
     * active. Calling it after {@code driverManager.quitDriver()} will silently fail.
     *
     * @param result the TestNG result for the failing test
     * @param driver the active WebDriver session
     */
    public static void captureScreenshotForResult(ITestResult result, WebDriver driver) {
        ExtentTest test = ExtentManager.getTest();
        if (test == null || driver == null) {
            return;
        }
        String id = qualifiedId(result.getMethod());
        doSaveScreenshot(driver, result.getMethod().getMethodName(), test);
        screenshotCapturedForId.set(id);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Returns a qualified identifier for a test method: {@code "SimpleClassName.methodName"}.
     * Using the class name prevents tests with identical method names in different classes
     * from sharing the same report entry.
     */
    private static String qualifiedId(ITestNGMethod method) {
        String className = method.getTestClass() != null
                ? method.getTestClass().getRealClass().getSimpleName()
                : "Unknown";
        return className + "." + method.getMethodName();
    }

    /**
     * Creates a new {@link ExtentTest} entry for {@code testMethod}, or returns the
     * existing one if it is already bound to the current thread for the same qualified ID.
     */
    private ExtentTest ensureTestCreated(ITestNGMethod testMethod) {
        String id = qualifiedId(testMethod);
        if (ExtentManager.getTest() != null && id.equals(ExtentManager.getTestName())) {
            return ExtentManager.getTest();
        }
        String description = testMethod.getDescription();
        // Include class name in the visible report node name for clarity.
        String displayName = testMethod.getTestClass() != null
                ? testMethod.getTestClass().getRealClass().getSimpleName() + " › " + testMethod.getMethodName()
                : testMethod.getMethodName();
        return ExtentManager.createTest(displayName, id, description);
    }

    /**
     * Clears the thread-local reporting context after a test has finished (pass/fail/skip).
     * The screenshot-captured flag is cleared separately to avoid interfering with
     * any follow-on configuration listener calls.
     */
    private void cleanup(ITestNGMethod method) {
        screenshotCapturedForId.remove();
        ExtentManager.removeTest();
    }

    /**
     * Saves a screenshot to disk and attaches it to the given {@link ExtentTest} node.
     * Uses a portable relative path so the {@code test-output/} directory remains self-contained.
     */
    private static void doSaveScreenshot(ITestResult tr, ExtentTest test) {
        Object instance = tr.getInstance();
        if (!(instance instanceof com.arkhive.tests.BaseTest baseTest)) {
            return;
        }
        WebDriver driver = baseTest.getDriver();
        if (driver == null) {
            return;
        }
        String methodName = tr.getMethod() != null ? tr.getMethod().getMethodName() : "test";
        doSaveScreenshot(driver, methodName, test);
    }

    private static void doSaveScreenshot(WebDriver driver, String methodName, ExtentTest test) {
        try {
            if (!(driver instanceof TakesScreenshot takesScreenshot)) {
                return;
            }
            byte[] screenshotBytes = takesScreenshot.getScreenshotAs(OutputType.BYTES);
            String fileName = methodName + "_" + System.currentTimeMillis() + ".png";

            Path screenshotDir = Path.of("test-output", "screenshots");
            Files.createDirectories(screenshotDir);
            Files.write(screenshotDir.resolve(fileName), screenshotBytes);

            test.info("Failure Screenshot",
                    MediaEntityBuilder.createScreenCaptureFromPath("screenshots/" + fileName).build());
        } catch (Exception e) {
            ReportLogger.warn("Failed to capture screenshot: " + e.getMessage());
        }
    }
}
