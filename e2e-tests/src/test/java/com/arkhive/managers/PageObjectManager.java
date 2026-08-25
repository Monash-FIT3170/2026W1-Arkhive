package com.arkhive.managers;

import com.arkhive.pages.DocumentPreviewPage;
import com.arkhive.pages.UploadPage;
import com.arkhive.pages.ValidationPage;
import org.openqa.selenium.WebDriver;

/**
 * PageObjectManager acts as a factory and cache for Page instances (e.g. UploadPage, DocumentPreviewPage, ValidationPage).
 * It ensures that Page instances are lazily initialized and share the single active WebDriver instance.
 */
public class PageObjectManager {

    private final WebDriver driver;
    private UploadPage uploadPage;
    private DocumentPreviewPage documentPreviewPage;
    private ValidationPage validationPage;

    public PageObjectManager(WebDriver driver) {
        this.driver = driver;
    }

    public UploadPage getUploadPage() {
        if (uploadPage == null) {
            uploadPage = new UploadPage(driver);
        }
        return uploadPage;
    }

    public DocumentPreviewPage getDocumentPreviewPage() {
        if (documentPreviewPage == null) {
            documentPreviewPage = new DocumentPreviewPage(driver);
        }
        return documentPreviewPage;
    }

    public ValidationPage getValidationPage() {
        if (validationPage == null) {
            validationPage = new ValidationPage(driver);
        }
        return validationPage;
    }
}
