package com.arkhive.pages.components;

import com.arkhive.pageobjects.components.ChatPanelComponentObjects;
import com.arkhive.pages.BasePage;
import org.openqa.selenium.By;
import org.openqa.selenium.TimeoutException;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.support.ui.WebDriverWait;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

/**
 * Reusable Component Object representing the AI Assistant Chat and Review Panel.
 */
public class ChatPanelComponent extends BasePage {

    private static final String DEFAULT_GREETING =
            "Hi there, I'm Arkhive's Virtual Assistant. What would you like to do today?";
    private static final String ERROR_SIGNATURE =
            "Error: Chatbot service failed";

    private final ChatPanelComponentObjects pageObjects;

    public ChatPanelComponent(WebDriver driver) {
        super(driver);
        this.pageObjects = new ChatPanelComponentObjects();
    }

    public boolean isOpen() {
        return isDisplayed(pageObjects.panelHeader, 3);
    }

    public void open() {
        if (!isOpen()) {
            click(pageObjects.openAssistantButton);
            waitForVisible(pageObjects.panelHeader, 5);
        }
    }

    public void close() {
        if (isOpen()) {
            click(pageObjects.collapseButton);
            waitForInvisibility(pageObjects.panelHeader, 5);
        }
    }

    public void switchToChatTab() {
        click(pageObjects.chatTab);
        waitForVisible(pageObjects.messageTextarea, 5);
    }

    public void switchToReviewTab() {
        click(pageObjects.reviewTab);
    }

    public void switchToHistoryTab() {
        click(pageObjects.historyTab);
    }

    public void typeMessage(String message) {
        clearAndType(pageObjects.messageTextarea, message);
    }

    public void sendMessage(String message) {
        typeMessage(message);
        click(pageObjects.sendMessageButton);
    }

    public boolean isUserMessageDisplayed(String message) {
        try {
            By locator = By.xpath("//div[contains(@class,'chat-end')]//div[contains(@class,'chat-bubble') and contains(text(),\"" + message + "\")]");
            return isDisplayed(locator, 5);
        } catch (Exception e) {
            return false;
        }
    }

    public List<String> getUserMessages() {
        List<String> messages = new ArrayList<>();
        try {
            List<WebElement> elements = driver.findElements(pageObjects.userMessageBubbles);
            for (WebElement el : elements) {
                messages.add(el.getText().trim());
            }
        } catch (Exception ignored) {
        }
        return messages;
    }

    public int getMessageCount() {
        try {
            List<WebElement> bubbles = driver.findElements(pageObjects.chatBubbles);
            return bubbles.size();
        } catch (Exception e) {
            return 0;
        }
    }

    public List<String> getMessageTexts() {
        List<String> texts = new ArrayList<>();
        try {
            List<WebElement> bubbles = driver.findElements(pageObjects.chatBubbles);
            for (WebElement bubble : bubbles) {
                texts.add(bubble.getText().trim());
            }
        } catch (Exception ignored) {
        }
        return texts;
    }

    public boolean isLoading() {
        return isDisplayed(pageObjects.loadingDots, 2);
    }

    /**
     * Waits for the AI response lifecycle to complete:
     * 1. Loading indicator (dots) is no longer visible.
     * 2. An assistant message beyond the initial greeting is present and non-empty.
     * 3. The message is not a transient loading placeholder.
     *
     * @param timeoutSeconds maximum duration to wait for the response
     * @return true if response completed within the timeout, false otherwise
     */
    public boolean waitForAssistantResponse(int timeoutSeconds) {
        try {
            WebDriverWait customWait = new WebDriverWait(driver, Duration.ofSeconds(timeoutSeconds));
            return Boolean.TRUE.equals(customWait.until(d -> {
                boolean hasLoading = !d.findElements(pageObjects.loadingDots).isEmpty();
                if (hasLoading) {
                    return false;
                }
                List<WebElement> bubbles = d.findElements(pageObjects.assistantMessageBubbles);
                if (bubbles.size() < 2) {
                    return false;
                }
                WebElement lastBubble = bubbles.get(bubbles.size() - 1);
                String text = lastBubble.getText().trim();
                return !text.isEmpty() && !text.contains("Just a moment");
            }));
        } catch (TimeoutException e) {
            return false;
        }
    }

    /**
     * Retrieves the text of the latest assistant message in the conversation.
     * If an assistant response was received, this returns that response rather than the greeting.
     */
    public String getLastAssistantResponseText() {
        try {
            List<WebElement> bubbles = driver.findElements(pageObjects.assistantMessageBubbles);
            if (bubbles.size() > 1) {
                return bubbles.get(bubbles.size() - 1).getText().trim();
            } else if (!bubbles.isEmpty()) {
                return bubbles.get(0).getText().trim();
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    /**
     * Distinguishes a genuine assistant response from a service error notification,
     * a loading placeholder, or the default greeting.
     */
    public boolean isAssistantResponseGenuine() {
        String lastResponse = getLastAssistantResponseText();
        return !lastResponse.isEmpty()
                && !lastResponse.equals(DEFAULT_GREETING)
                && !lastResponse.contains("Just a moment")
                && !lastResponse.contains(ERROR_SIGNATURE)
                && !hasError();
    }

    public boolean hasError() {
        return isDisplayed(pageObjects.errorAlert, 1)
                || isDisplayed(pageObjects.errorToast, 1)
                || isDisplayed(pageObjects.chatErrorMessage, 1);
    }

    public String getErrorMessage() {
        if (isDisplayed(pageObjects.chatErrorMessage, 1)) {
            return getText(pageObjects.chatErrorMessage);
        }
        if (isDisplayed(pageObjects.errorToast, 1)) {
            return getText(pageObjects.errorToast);
        }
        if (isDisplayed(pageObjects.errorAlert, 1)) {
            return getText(pageObjects.errorAlert);
        }
        return "";
    }
}
