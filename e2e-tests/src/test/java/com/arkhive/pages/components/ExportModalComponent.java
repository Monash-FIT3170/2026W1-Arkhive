package com.arkhive.pages.components;

import com.arkhive.pageobjects.components.ExportModalComponentObjects;
import com.arkhive.pages.BasePage;
import com.arkhive.reporting.ReportLogger;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

/**
 * Reusable Component Object representing the Export Data Modal in Validation Workspace.
 */
public class ExportModalComponent extends BasePage {

    private final ExportModalComponentObjects pageObjects;

    public ExportModalComponent(WebDriver driver) {
        super(driver);
        this.pageObjects = new ExportModalComponentObjects();
    }

    public boolean isOpen() {
        return isDisplayed(pageObjects.modalTitle, 3);
    }

    public boolean isOpen(int timeoutSeconds) {
        return isDisplayed(pageObjects.modalTitle, timeoutSeconds);
    }

    public boolean isFormatOptionsDisplayed() {
        return isDisplayed(pageObjects.csvDefaultTemplate, 5)
                && isDisplayed(pageObjects.jsonDefaultTemplate, 5);
    }

    /**
     * Opens the Export modal by clicking the Export button in the workspace toolbar
     * if the modal is not already open.
     */
    public void open() {
        if (!isOpen()) {
            click(pageObjects.openExportModalButton);
            waitForVisible(pageObjects.modalTitle, 5);
            ReportLogger.info("Opened Export Data modal");
        }
    }

    public void setExportFilename(String filename) {
        clearAndType(pageObjects.filenameInput, filename);
        ReportLogger.info("Set export filename: " + filename);
    }

    public boolean isCsvDefaultSelected() {
        try {
            WebElement card = waitForPresence(pageObjects.csvDefaultTemplate);
            String className = card.getDomAttribute("class");
            return className != null && className.contains("border-primary");
        } catch (Exception e) {
            return false;
        }
    }

    public void selectCsvDefault() {
        if (!isCsvDefaultSelected()) {
            click(pageObjects.csvDefaultTemplate);
        }
        ReportLogger.info("Selected CSV Default template");
    }

    public void selectCsvSimple() {
        click(pageObjects.csvSimpleTemplate);
        ReportLogger.info("Selected CSV Simple template");
    }

    public void selectJsonDefault() {
        click(pageObjects.jsonDefaultTemplate);
        ReportLogger.info("Selected JSON Default template");
    }

    public void selectTxtDefault() {
        click(pageObjects.txtDefaultTemplate);
        ReportLogger.info("Selected TXT Default template");
    }

    public void selectXlsxDefault() {
        click(pageObjects.xlsxDefaultTemplate);
        ReportLogger.info("Selected XLSX Default template");
    }

    public void selectMergeSingle() {
        click(pageObjects.mergeSingleRadio);
        ReportLogger.info("Selected single file merge strategy");
    }

    public void selectMergePerFile() {
        click(pageObjects.mergePerFileRadio);
        ReportLogger.info("Selected per-document merge strategy");
    }

    public void selectMergePerPage() {
        click(pageObjects.mergePerPageRadio);
        ReportLogger.info("Selected per-page merge strategy");
    }

    public void toggleSelectAllPages() {
        click(pageObjects.toggleSelectAllPagesButton);
        ReportLogger.info("Toggled Select All pages in Export modal");
    }

    public boolean isDownloadButtonEnabled() {
        return isEnabled(pageObjects.downloadButton);
    }

    public void clickDownload() {
        click(pageObjects.downloadButton);
        ReportLogger.info("Initiated export file download");
        if (isDisplayed(pageObjects.confirmDialogTitle, 2)) {
            click(pageObjects.confirmDialogYesButton);
            ReportLogger.info("Confirmed bulk download dialog");
        }
        waitForInvisibility(pageObjects.modalTitle, 10);
    }

    public void close() {
        click(pageObjects.closeButton);
        waitForInvisibility(pageObjects.modalTitle, 5);
        ReportLogger.info("Closed Export Data modal");
    }

    public void cancel() {
        click(pageObjects.cancelButton);
        waitForInvisibility(pageObjects.modalTitle, 5);
        ReportLogger.info("Cancelled Export Data modal");
    }

    /**
     * Waits up to {@code timeoutSeconds} for a completed download matching the given prefix
     * and extension to appear in {@code downloadDir}. Excludes transient {@code .crdownload} files.
     *
     * <p>Uses Selenium explicit wait (no {@code Thread.sleep()}).
     *
     * @param downloadDir directory where browser downloads are saved
     * @param filenamePrefix prefix of the expected file
     * @param extension expected file extension (e.g. ".csv")
     * @param timeoutSeconds maximum duration to wait
     * @return Path to the downloaded file, or null if timed out
     */
    public Path waitForDownload(Path downloadDir, String filenamePrefix, String extension, int timeoutSeconds) {
        try {
            WebDriverWait customWait = new WebDriverWait(driver, Duration.ofSeconds(timeoutSeconds));
            Path downloaded = customWait.until(d -> {
                try (DirectoryStream<Path> stream = Files.newDirectoryStream(downloadDir)) {
                    for (Path file : stream) {
                        String fileName = file.getFileName().toString();
                        if (!fileName.endsWith(".crdownload")
                                && (filenamePrefix == null || fileName.startsWith(filenamePrefix))
                                && fileName.endsWith(extension)) {
                            if (Files.isRegularFile(file) && Files.size(file) > 0) {
                                return file;
                            }
                        }
                    }
                } catch (IOException ignored) {
                }
                return null;
            });
            if (downloaded != null) {
                ReportLogger.pass("Confirmed exported file download complete: " + downloaded.getFileName().toString());
            }
            return downloaded;
        } catch (TimeoutException e) {
            return null;
        }
    }

    /**
     * Waits up to {@code timeoutSeconds} for any completed download with the given extension.
     */
    public Path waitForDownload(Path downloadDir, String extension, int timeoutSeconds) {
        return waitForDownload(downloadDir, null, extension, timeoutSeconds);
    }
}
