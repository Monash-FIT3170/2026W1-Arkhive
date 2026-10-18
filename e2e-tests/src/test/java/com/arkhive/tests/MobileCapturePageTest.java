package com.arkhive.tests;

import org.testng.Assert;
import org.testng.annotations.Test;

public class MobileCapturePageTest extends BaseTest {

    @Test(description = "Verify that accessing mobile capture with an invalid or expired token displays warning alert")
    public void testInvalidTokenDisplaysWarningAlert() {
        mobileCapturePage.open(testConfig.getBaseUrl(), "nonexistent-test-token-00000");

        Assert.assertTrue(mobileCapturePage.isInvalidTokenDisplayed(),
                "Warning alert should be displayed when token validation fails");
        String warningMsg = mobileCapturePage.getInvalidTokenMessage();
        Assert.assertTrue(warningMsg.contains("no longer valid"),
                "Warning message should state that the QR code is no longer valid, got: " + warningMsg);
    }
}
