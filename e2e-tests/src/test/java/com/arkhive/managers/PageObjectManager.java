package com.arkhive.managers;

import com.arkhive.pages.DocumentPreviewPage;
import com.arkhive.pages.HomePage;
import com.arkhive.pages.LoginPage;
import com.arkhive.pages.MobileCapturePage;
import com.arkhive.pages.ProjectsPage;
import com.arkhive.pages.ProjectWorkspacePage;
import com.arkhive.pages.UploadPage;
import com.arkhive.pages.ValidationPage;
import com.arkhive.pages.components.ChatPanelComponent;
import com.arkhive.pages.components.ExportModalComponent;
import com.arkhive.pages.components.NavbarComponent;
import org.openqa.selenium.WebDriver;

/**
 * PageObjectManager acts as a factory and cache for Page and Component instances.
 * It ensures that instances are lazily initialized and share the active WebDriver instance.
 */
public class PageObjectManager {

    private final WebDriver driver;
    private LoginPage loginPage;
    private UploadPage uploadPage;
    private DocumentPreviewPage documentPreviewPage;
    private ValidationPage validationPage;
    private HomePage homePage;
    private ProjectsPage projectsPage;
    private ProjectWorkspacePage projectWorkspacePage;
    private MobileCapturePage mobileCapturePage;
    private NavbarComponent navbarComponent;
    private ExportModalComponent exportModalComponent;
    private ChatPanelComponent chatPanelComponent;

    public PageObjectManager(WebDriver driver) {
        this.driver = driver;
    }

    public LoginPage getLoginPage() {
        if (loginPage == null) {
            loginPage = new LoginPage(driver);
        }
        return loginPage;
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

    public HomePage getHomePage() {
        if (homePage == null) {
            homePage = new HomePage(driver);
        }
        return homePage;
    }

    public ProjectsPage getProjectsPage() {
        if (projectsPage == null) {
            projectsPage = new ProjectsPage(driver);
        }
        return projectsPage;
    }

    public ProjectWorkspacePage getProjectWorkspacePage() {
        if (projectWorkspacePage == null) {
            projectWorkspacePage = new ProjectWorkspacePage(driver);
        }
        return projectWorkspacePage;
    }

    public MobileCapturePage getMobileCapturePage() {
        if (mobileCapturePage == null) {
            mobileCapturePage = new MobileCapturePage(driver);
        }
        return mobileCapturePage;
    }

    public NavbarComponent getNavbarComponent() {
        if (navbarComponent == null) {
            navbarComponent = new NavbarComponent(driver);
        }
        return navbarComponent;
    }

    public ExportModalComponent getExportModalComponent() {
        if (exportModalComponent == null) {
            exportModalComponent = new ExportModalComponent(driver);
        }
        return exportModalComponent;
    }

    public ChatPanelComponent getChatPanelComponent() {
        if (chatPanelComponent == null) {
            chatPanelComponent = new ChatPanelComponent(driver);
        }
        return chatPanelComponent;
    }
}
