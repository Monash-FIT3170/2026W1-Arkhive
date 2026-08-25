package com.arkhive.pageobjects;

import org.openqa.selenium.By;

public interface UploadPageObjects {
    
    By fileInput = By.cssSelector("input[type='file']");
    By brandingHeading = By.xpath("//h1[contains(text(),'ARKHIVE')]");
    By dropzoneText = By.xpath("//p[contains(text(),'Click to select files, or drop them anywhere')]");
    By errorAlert = By.cssSelector(".alert-error");
}
    

