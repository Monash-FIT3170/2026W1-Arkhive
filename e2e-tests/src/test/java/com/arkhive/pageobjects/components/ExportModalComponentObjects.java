package com.arkhive.pageobjects.components;

import org.openqa.selenium.By;

/**
 * Locator definitions for ExportModal component.
 */
public class ExportModalComponentObjects {

    // Modal trigger
    public final By openExportModalButton = By.xpath("//button[normalize-space()='Export' or contains(.,'Export')]");

    public final By modalTitle = By.xpath("//div[contains(@class,'modal-open')]//h3[normalize-space()='Export Data']");
    public final By closeButton = By.xpath("//div[contains(@class,'modal-open')]//button[@aria-label='Close']");
    public final By filenameInput = By.xpath("//div[contains(@class,'modal-open')]//input[@placeholder='export']");

    // Format template cards
    public final By csvDefaultTemplate = By.xpath("//div[contains(@class,'modal-open')]//div[.//span[text()='CSV']]//div[contains(@class,'cursor-pointer') and .//span[text()='Default Template']]");
    public final By csvSimpleTemplate = By.xpath("//div[contains(@class,'modal-open')]//div[.//span[text()='CSV']]//div[contains(@class,'cursor-pointer') and .//span[text()='Simple Template']]");
    public final By jsonDefaultTemplate = By.xpath("//div[contains(@class,'modal-open')]//div[.//span[text()='JSON']]//div[contains(@class,'cursor-pointer') and .//span[text()='Default Template']]");
    public final By txtDefaultTemplate = By.xpath("//div[contains(@class,'modal-open')]//div[.//span[text()='TXT']]//div[contains(@class,'cursor-pointer') and .//span[text()='Default Template']]");
    public final By xlsxDefaultTemplate = By.xpath("//div[contains(@class,'modal-open')]//div[.//span[text()='XLSX']]//div[contains(@class,'cursor-pointer') and .//span[text()='Default Template']]");

    // Merge strategies
    public final By mergeSingleRadio = By.xpath("//input[@type='radio' and following-sibling::div//span[contains(text(),'Merge into a single file')]]");
    public final By mergePerFileRadio = By.xpath("//input[@type='radio' and following-sibling::div//span[contains(text(),'Export per document')]]");
    public final By mergePerPageRadio = By.xpath("//input[@type='radio' and following-sibling::div//span[contains(text(),'Export per page')]]");

    // Page selection
    public final By toggleSelectAllPagesButton = By.xpath("//div[contains(@class,'modal-open')]//button[normalize-space()='Select All' or normalize-space()='Deselect All']");

    // Footer actions
    public final By cancelButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(@class,'btn-ghost') and normalize-space()='Cancel']");
    public final By downloadButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(@class,'btn-primary') and starts-with(normalize-space(.), 'Download')]");
    // Confirmation dialog
    public final By confirmDialogTitle = By.xpath("//h3[contains(text(),'Confirm Download')]");
    public final By confirmDialogYesButton = By.xpath("//button[contains(text(),'Yes, download')]");
}
