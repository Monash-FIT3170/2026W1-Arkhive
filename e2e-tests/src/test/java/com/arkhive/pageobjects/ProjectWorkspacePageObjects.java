package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for ProjectWorkspacePage (/projects/:id).
 */
public class ProjectWorkspacePageObjects {

    public final By backToProjectsButton = By.xpath("//button[contains(.,'Projects') and .//*[local-name()='svg']]");
    public final By projectNameBreadcrumb = By.xpath("//span[contains(@class,'truncate') and preceding-sibling::span[text()='/']]");
    public final By filesTabButton = By.xpath("//div[contains(@class,'join')]//button[contains(.,'Files')]");
    public final By validateTabButton = By.xpath("//div[contains(@class,'join')]//button[contains(.,'Validate')]");
    public final By loadingSpinner = By.cssSelector(".loading-spinner");
    public final By errorAlert = By.xpath("//div[contains(@class,'alert-error')]");

    // Toolbar & Files View
    public final By toolbar = By.xpath("//div[contains(@class,'rounded-lg')][.//button[contains(.,'Select all') or contains(.,'Clear')]]");
    public final By selectAllButton = By.xpath("//button[normalize-space()='Select all']");
    public final By deselectAllButton = By.xpath("//button[normalize-space()='Clear']");
    public final By processButton = By.xpath("//button[contains(text(),'Process')]");
    public final By deleteSelectedButton = By.xpath("//button[contains(text(),'Delete')]");
    public final By previewCards = By.cssSelector("section div.group.w-40, div.group.w-40");
    public final By fileInput = By.cssSelector("input[type='file']");

    // Embedded Validation Workspace
    public final By validationWorkspace = By.xpath("//div[contains(@class,'join')][.//button[contains(.,'Split')]]");

    // Modals
    public final By deleteModalTitle = By.xpath("//div[contains(@class,'modal-open')]//h3[contains(text(),'Delete')]");
    public final By deleteModalConfirmButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(@class,'btn-error') and contains(text(),'Delete')]");
    public final By deleteModalCancelButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(@class,'btn-ghost') and contains(text(),'Cancel')]");
    public final By reprocessModalTitle = By.xpath("//div[contains(@class,'modal-open')]//h3[contains(text(),'Reprocess Pages?')]");
    public final By reprocessModalConfirmButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(@class,'btn-warning') and contains(text(),'Reprocess')]");
    public final By lowQualityModalTitle = By.xpath("//div[contains(@class,'modal-open')]//h3[contains(text(),'Warning: Low Quality Images')]");
    public final By lowQualityModalConfirmButton = By.xpath("//div[contains(@class,'modal-open')]//button[contains(text(),'Yes, process anyway')]");
}
