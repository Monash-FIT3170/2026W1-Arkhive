package com.arkhive.pageobjects;

import org.openqa.selenium.By;

public interface DocumentPreviewPageObjects {
    By previewHeader = By.xpath("//header[contains(text(),'Preview')]");
    By sidebarHeading = By.xpath("//h2[contains(text(),'Document Processing')]");
    By classificationModalTitle = By.xpath("//h3[contains(text(),'Classify Documents')]");
    By confirmClassificationButton = By.xpath("//button[contains(text(),'Confirm Classification')]");
    By cancelClassificationButton = By.xpath("//button[contains(text(),'Cancel')]");
    By processButton = By.xpath("//button[contains(text(),'Process')]");
    By gridItems = By.cssSelector("main div.grid > article");
    By errorAlert = By.cssSelector(".alert-error");
}
