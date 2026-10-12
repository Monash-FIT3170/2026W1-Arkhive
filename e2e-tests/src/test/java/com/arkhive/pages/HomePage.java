package com.arkhive.pages;

import com.arkhive.pageobjects.HomePageObjects;
import org.openqa.selenium.WebDriver;

/**
 * Page Object representing the Home landing page (/).
 */
public class HomePage extends BasePage {

    private final HomePageObjects pageObjects;

    public HomePage(WebDriver driver) {
        super(driver);
        this.pageObjects = new HomePageObjects();
    }

    public void open(String baseUrl) {
        driver.get(baseUrl);
    }

    public boolean isDisplayed() {
        return isDisplayed(pageObjects.welcomeHeading);
    }

    public boolean isDisplayed(int timeoutSeconds) {
        return isDisplayed(pageObjects.welcomeHeading, timeoutSeconds);
    }

    public void clickCreateProject() {
        click(pageObjects.createProjectCard);
    }

    public void clickUploadWithoutProject() {
        click(pageObjects.uploadWithoutProjectCard);
    }

    public boolean isCreateProjectCardDisplayed() {
        return isDisplayed(pageObjects.createProjectCard);
    }

    public boolean isUploadWithoutProjectCardDisplayed() {
        return isDisplayed(pageObjects.uploadWithoutProjectCard);
    }
}
