package com.arkhive.pages.components;

import com.arkhive.pageobjects.components.ChatPanelComponentObjects;
import com.arkhive.pages.BasePage;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;

import java.util.ArrayList;
import java.util.List;

/**
 * Reusable Component Object representing the AI Assistant Chat and Review Panel.
 */
public class ChatPanelComponent extends BasePage {

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

    public boolean hasError() {
        return isDisplayed(pageObjects.errorAlert, 2);
    }

    public String getErrorMessage() {
        return getText(pageObjects.errorAlert);
    }
}
