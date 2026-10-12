package com.arkhive.pages.components;

import com.arkhive.pageobjects.components.ExportModalComponentObjects;
import com.arkhive.pages.BasePage;
import org.openqa.selenium.WebDriver;

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

    public void setExportFilename(String filename) {
        clearAndType(pageObjects.filenameInput, filename);
    }

    public void selectCsvDefault() {
        click(pageObjects.csvDefaultTemplate);
    }

    public void selectCsvSimple() {
        click(pageObjects.csvSimpleTemplate);
    }

    public void selectJsonDefault() {
        click(pageObjects.jsonDefaultTemplate);
    }

    public void selectTxtDefault() {
        click(pageObjects.txtDefaultTemplate);
    }

    public void selectXlsxDefault() {
        click(pageObjects.xlsxDefaultTemplate);
    }

    public void selectMergeSingle() {
        click(pageObjects.mergeSingleRadio);
    }

    public void selectMergePerFile() {
        click(pageObjects.mergePerFileRadio);
    }

    public void selectMergePerPage() {
        click(pageObjects.mergePerPageRadio);
    }

    public void toggleSelectAllPages() {
        click(pageObjects.toggleSelectAllPagesButton);
    }

    public void clickDownload() {
        click(pageObjects.downloadButton);
        if (isDisplayed(pageObjects.confirmDialogTitle, 3)) {
            click(pageObjects.confirmDialogYesButton);
        }
        waitForInvisibility(pageObjects.modalTitle, 10);
    }

    public void close() {
        click(pageObjects.closeButton);
        waitForInvisibility(pageObjects.modalTitle, 5);
    }

    public void cancel() {
        click(pageObjects.cancelButton);
        waitForInvisibility(pageObjects.modalTitle, 5);
    }
}
