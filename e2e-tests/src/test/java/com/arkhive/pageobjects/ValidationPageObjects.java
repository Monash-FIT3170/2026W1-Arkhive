package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for ValidationPage.
 */
public class ValidationPageObjects {

    public final By loadingIndicator = By.xpath("//div[normalize-space()='Loading...']");
    public final By workspaceContainer = By.xpath("//div[contains(@class,'bg-base-100') and .//button[contains(.,'Split') or contains(.,'Document')]]");
    public final By viewModeGroup = By.xpath("//div[contains(@class,'join')][.//button[contains(.,'Split')]]");
    public final By splitViewButton = By.xpath("//button[@title='Side-by-side Split View' or contains(.,'Split')]");
    public final By documentViewButton = By.xpath("//button[@title='Document Full Focus View' or contains(.,'Document')]");
    public final By tableViewButton = By.xpath("//button[contains(.,'Table')]");
    public final By documentViewer = By.xpath("//*[contains(@class,'document') or contains(@class,'Document') or .//canvas or .//img[contains(@class,'object-contain')]]");
    public final By extractedDataViewer = By.xpath("//table | //div[contains(@class,'overflow-x-auto')]");
    public final By confidenceBadge = By.xpath("//div[contains(.,'Confidence:')]");

    // Edit mode
    /** "Edit Table" / "Done Editing" toggle button in the Extracted Data panel toolbar */
    public final By editTableButton = By.xpath("//button[contains(.,'Edit Table') or contains(.,'Done Editing')]");
    /** First data cell in the extracted data table (any tbody td) */
    public final By firstDataCell = By.xpath("(//table//tbody//td)[1]");
    /**
     * Textarea rendered inside a table body cell while the cell is being edited.
     * Scoped to tbody to avoid hitting any other textarea on the page.
     * The component uses {@code autoFocus} and selects all text on focus, so no
     * select-all keystroke is needed before typing a replacement value.
     */
    public final By activeCellTextarea = By.xpath("//table//tbody//td//textarea");
    /** "Table" view-mode button (unambiguous title-attribute locator) */
    public final By tableViewModeButton = By.xpath("//button[@title='Table Full Focus View']");
    /** "Split" view-mode button (unambiguous title-attribute locator) */
    public final By splitViewModeButton = By.xpath("//button[@title='Side-by-side Split View']");
    /** Document panel — present in Split and Document modes, absent in Table-only mode */
    public final By documentPanel = By.xpath("//div[.//img[contains(@class,'object-contain')] or .//canvas]");
    /** "Export" button in Extracted Data panel toolbar */
    public final By exportButton = By.xpath("//button[normalize-space()='Export' or contains(.,'Export')]");

    // Multi-page navigation in Validation Workspace
    public final By nextPageButton = By.xpath("//button[@title='Next Page' or @aria-label='Next Page']");
    public final By prevPageButton = By.xpath("//button[@title='Previous Page' or @aria-label='Previous Page']");
    public final By pageNavigationContainer = By.xpath("//div[contains(@class,'flex') and .//span[normalize-space()='Page']]");
    public final By activePageButton = By.xpath("//div[contains(@class,'flex') and .//span[normalize-space()='Page']]//button[contains(@class,'btn-primary')]");

    // OCR text overlay polygons
    public final By ocrBoundingBoxes = By.xpath("//*[local-name()='svg']//*[local-name()='polygon']");
}
