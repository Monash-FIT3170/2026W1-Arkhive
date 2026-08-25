package com.arkhive.pageobjects;

import org.openqa.selenium.By;

public interface ValidationPageObjects {
    By container = By.cssSelector("div.min-h-screen");
    By documentViewer = By.xpath("//*[contains(@class, 'document') or contains(@class, 'Document') or contains(text(), 'Document')]");
    By extractedDataViewer = By.xpath("//*[contains(@class, 'extracted') or contains(@class, 'Extracted') or contains(text(), 'Extracted Data')]");
}
