package com.arkhive.tests;

import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * End-to-end test for exporting processed document data.
 *
 * <p>Covers the complete export workflow:
 * <ol>
 *   <li>Authenticate as a guest user.</li>
 *   <li>Upload valid-sample.pdf and process it to reach the Validation workspace.</li>
 *   <li>Open the Export modal from the Extracted Data panel toolbar.</li>
 *   <li>Select CSV format and initiate download.</li>
 *   <li>Wait for the file to finish downloading into the isolated test download directory.</li>
 *   <li>Verify the downloaded file exists, is non-empty, and contains meaningful exported tabular data.</li>
 * </ol>
 */
public class ExportModalComponentTest extends BaseTest {

    @BeforeMethod
    public void setupGuestSession() {
        loginAsGuest();
    }

    /**
     * Uploads the valid sample document, triggers processing, and waits until
     * the Validation workspace is fully loaded.
     */
    private void reachValidationWorkspace() {
        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(documentPreviewPage.isDisplayed(15),
                "DocumentPreviewPage should be displayed upon uploading a valid file");

        documentPreviewPage.clickProcess();

        int timeout = testConfig.getProcessingTimeoutSeconds();
        Assert.assertTrue(validationPage.isWorkspaceLoaded(timeout),
                "Validation workspace should load within " + timeout + " seconds");
    }

    /**
     * Verifies that a user can export processed table data as a CSV file,
     * and that the downloaded file exists, has a .csv extension, and contains
     * both a table header and non-empty data records.
     */
    @Test(description = "Verify exporting processed document data as CSV produces a valid non-empty download with data records",
          timeOut = 200000)
    public void testExportExtractedDataAsCsv() throws IOException {
        reachValidationWorkspace();

        // 1. Open the Export modal from the Validation workspace
        validationPage.openExportModal();
        Assert.assertTrue(exportModalComponent.isOpen(5),
                "Export modal should be displayed after clicking the Export button");

        // 2. Configure export options: ensure CSV Default template is selected
        String exportFilename = "arkhive_e2e_export_" + System.currentTimeMillis();
        exportModalComponent.setExportFilename(exportFilename);
        exportModalComponent.selectCsvDefault();

        Assert.assertTrue(exportModalComponent.isDownloadButtonEnabled(),
                "Download button should be enabled when a valid filename and format are selected");

        // 3. Initiate the export and wait for modal to close
        exportModalComponent.clickDownload();
        Assert.assertFalse(exportModalComponent.isOpen(5),
                "Export modal should close after initiating download");

        // 4. Wait for the exported file to complete downloading in the isolated test directory
        Path downloadedFile = exportModalComponent.waitForDownload(downloadDir, exportFilename, ".csv", 15);
        Assert.assertNotNull(downloadedFile,
                "Exported CSV file should be downloaded into the test download directory within 15 seconds");

        // 5. Verify the file exists, has expected extension, and is non-empty
        Assert.assertTrue(Files.exists(downloadedFile),
                "Downloaded file should exist on the filesystem");
        Assert.assertTrue(downloadedFile.getFileName().toString().endsWith(".csv"),
                "Downloaded file should have a .csv extension");
        Assert.assertTrue(Files.size(downloadedFile) > 0,
                "Downloaded CSV file should not be empty");

        // 6. Verify meaningful exported content (contains header and actual data records)
        List<String> lines = Files.readAllLines(downloadedFile);
        Assert.assertTrue(lines.size() >= 2,
                "Exported CSV should contain at least 2 lines (header and data row), but found: " + lines.size());

        String headerLine = lines.get(0).trim();
        Assert.assertFalse(headerLine.isEmpty(),
                "CSV header line should not be empty");

        // Ensure at least one data line contains meaningful non-empty values
        boolean hasDataRecord = lines.subList(1, lines.size()).stream()
                .anyMatch(line -> !line.trim().isEmpty() && !line.replace(",", "").trim().isEmpty());
        Assert.assertTrue(hasDataRecord,
                "Exported CSV file should contain actual data records, not merely empty lines or headers");
    }
}
