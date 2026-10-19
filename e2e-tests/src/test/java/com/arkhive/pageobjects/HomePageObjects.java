package com.arkhive.pageobjects;

import org.openqa.selenium.By;

/**
 * Locator definitions for HomePage (/).
 */
public class HomePageObjects {

    public final By welcomeHeading = By.xpath("//h1[contains(text(),'Welcome to Arkhive')]");
    public final By welcomeSubheading = By.xpath("//p[contains(text(),'Organise documents in a project')]");
    public final By createProjectCard = By.xpath("//button[.//span[contains(text(),'Create a Project')]]");
    public final By uploadWithoutProjectCard = By.xpath("//button[.//span[contains(text(),'Upload Without a Project')]]");
    public final By goToProjectsText = By.xpath("//span[contains(text(),'Go to Projects')]");
    public final By startUploadText = By.xpath("//span[contains(text(),'Start Upload')]");
}
