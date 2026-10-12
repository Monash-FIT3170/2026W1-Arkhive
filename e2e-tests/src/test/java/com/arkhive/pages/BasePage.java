package com.arkhive.pages;

import org.openqa.selenium.By;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;

/**
 * Foundational BasePage class providing shared Selenium interaction helpers and explicit wait utilities.
 */
public class BasePage {

    protected final WebDriver driver;
    protected final WebDriverWait wait;

    public BasePage(WebDriver driver) {
        this.driver = driver;
        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));
    }

    protected WebElement waitForVisible(By locator) {
        return wait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    protected WebElement waitForVisible(By locator, int timeoutSeconds) {
        WebDriverWait customWait = new WebDriverWait(driver, Duration.ofSeconds(timeoutSeconds));
        return customWait.until(ExpectedConditions.visibilityOfElementLocated(locator));
    }

    protected WebElement waitForClickable(By locator) {
        return wait.until(ExpectedConditions.elementToBeClickable(locator));
    }

    protected WebElement waitForPresence(By locator) {
        return wait.until(ExpectedConditions.presenceOfElementLocated(locator));
    }

    protected void click(By locator) {
        waitForClickable(locator).click();
    }

    protected void type(By locator, String text) {
        waitForPresence(locator).sendKeys(text);
    }

    protected void clearAndType(By locator, String text) {
        WebElement element = waitForClickable(locator);
        element.clear();
        element.sendKeys(text);
    }

    protected String getText(By locator) {
        return waitForVisible(locator).getText();
    }

    protected boolean isDisplayed(By locator) {
        try {
            return waitForVisible(locator).isDisplayed();
        } catch (TimeoutException e) {
            return false;
        }
    }

    protected boolean isDisplayed(By locator, int timeoutSeconds) {
        try {
            return waitForVisible(locator, timeoutSeconds).isDisplayed();
        } catch (TimeoutException e) {
            return false;
        }
    }

    protected boolean waitForInvisibility(By locator, int timeoutSeconds) {
        try {
            WebDriverWait customWait = new WebDriverWait(driver, Duration.ofSeconds(timeoutSeconds));
            return Boolean.TRUE.equals(customWait.until(ExpectedConditions.invisibilityOfElementLocated(locator)));
        } catch (TimeoutException e) {
            return false;
        }
    }

    protected boolean isEnabled(By locator) {
        try {
            WebElement el = waitForVisible(locator);
            String ariaDisabled = el.getDomAttribute("aria-disabled");
            if ("true".equalsIgnoreCase(ariaDisabled)) {
                return false;
            }
            Object disabledProp = el.getDomProperty("disabled");
            if (Boolean.TRUE.equals(disabledProp)) {
                return false;
            }
            String disabledAttr = el.getDomAttribute("disabled");
            if (disabledAttr != null) {
                return false;
            }
            return el.isEnabled();
        } catch (Exception e) {
            return false;
        }
    }

    protected boolean isElementPresent(By locator) {
        return !driver.findElements(locator).isEmpty();
    }

    protected boolean waitForUrlContains(String urlFraction) {
        try {
            return Boolean.TRUE.equals(wait.until(ExpectedConditions.urlContains(urlFraction)));
        } catch (TimeoutException e) {
            return false;
        }
    }

    protected boolean waitForUrlContains(String urlFraction, int timeoutSeconds) {
        try {
            WebDriverWait customWait = new WebDriverWait(driver, Duration.ofSeconds(timeoutSeconds));
            return Boolean.TRUE.equals(customWait.until(ExpectedConditions.urlContains(urlFraction)));
        } catch (TimeoutException e) {
            return false;
        }
    }
}
