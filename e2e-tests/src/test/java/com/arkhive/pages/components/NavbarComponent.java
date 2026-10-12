package com.arkhive.pages.components;

import com.arkhive.pageobjects.components.NavbarComponentObjects;
import com.arkhive.pages.BasePage;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

/**
 * Reusable Component Object representing the global application Navbar.
 */
public class NavbarComponent extends BasePage {

    private final NavbarComponentObjects pageObjects;

    public NavbarComponent(WebDriver driver) {
        super(driver);
        this.pageObjects = new NavbarComponentObjects();
    }

    public boolean isDisplayed() {
        return isDisplayed(pageObjects.navbarContainer, 3);
    }

    public void clickBrandLogo() {
        click(pageObjects.brandLogoButton);
    }

    public void clickHome() {
        click(pageObjects.homeNavButton);
    }

    public void clickQuickScan() {
        click(pageObjects.quickScanNavButton);
    }

    public void clickProjects() {
        click(pageObjects.projectsNavButton);
    }

    public boolean isProjectsNavDisplayed() {
        return isDisplayed(pageObjects.projectsNavButton, 3);
    }

    public void openUserProfileMenu() {
        click(pageObjects.userProfileButton);
        waitForVisible(pageObjects.userProfileDropdownMenu, 5);
    }

    public String getUserDisplayName() {
        if (!isDisplayed(pageObjects.userProfileDropdownMenu, 2)) {
            openUserProfileMenu();
        }
        return getText(pageObjects.userDisplayName);
    }

    public void signOut() {
        if (!isDisplayed(pageObjects.userProfileDropdownMenu, 2)) {
            openUserProfileMenu();
        }
        click(pageObjects.signOutButton);
    }

    public boolean isGuestModeDisplayed() {
        return isDisplayed(pageObjects.guestBadge, 3);
    }

    public void clickGuestLogIn() {
        click(pageObjects.guestLogInButton);
    }

    public boolean isAuthenticatedUserDisplayed() {
        return isDisplayed(pageObjects.userProfileButton, 3);
    }

    public boolean isThemeToggleDisplayed() {
        return isDisplayed(pageObjects.themeToggleInput, 3);
    }

    public void toggleTheme() {
        click(pageObjects.themeToggleInput);
    }

    public boolean isValidationBackButtonDisplayed() {
        return isDisplayed(pageObjects.validationBackButton, 3);
    }

    public void clickValidationBack() {
        click(pageObjects.validationBackButton);
    }
}
