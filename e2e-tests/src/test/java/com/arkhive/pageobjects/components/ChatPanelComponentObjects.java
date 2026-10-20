package com.arkhive.pageobjects.components;

import org.openqa.selenium.By;

/**
 * Locator definitions for ChatPanel component.
 */
public class ChatPanelComponentObjects {

    // Collapsed trigger buttons
    public final By openAssistantButton = By.xpath("//button[@aria-label='Open AI Assistant' or @title='Open AI Assistant']");

    // Panel Header & Controls
    public final By panelHeader = By.xpath("//h2[normalize-space()='AI Assistant']");
    public final By collapseButton = By.xpath("//button[@aria-label='Collapse panel' or @title='Collapse panel' or @aria-label='Minimize']");
    public final By popOutButton = By.xpath("//button[@aria-label='Pop out as floating window']");
    public final By dockButton = By.xpath("//button[@aria-label='Dock to side']");

    // Navigation Tabs
    public final By chatTab = By.xpath("//button[@role='tab' and contains(.,'Chat')]");
    public final By reviewTab = By.xpath("//button[@role='tab' and contains(.,'Review')]");
    public final By historyTab = By.xpath("//button[@role='tab' and contains(.,'History')]");

    // Chat Interaction Elements
    public final By messageTextarea = By.cssSelector("textarea[placeholder='Type your message here']");
    public final By sendMessageButton = By.xpath("//button[@aria-label='Send message' or @title='Send message']");
    public final By chatBubbles = By.cssSelector(".chat-bubble");
    public final By loadingDots = By.cssSelector(".loading-dots");
    public final By errorAlert = By.xpath("//div[contains(@class,'alert-error')]");

    // Specific Message and Lifecycle Locators
    public final By userMessageBubbles = By.cssSelector(".chat-end .chat-bubble");
    public final By assistantMessageBubbles = By.cssSelector(".chat-start .chat-bubble");
    public final By errorToast = By.xpath("//div[contains(@class,'alert')]//*[contains(@class,'text-error')]/ancestor::div[contains(@class,'alert')]");
    public final By chatErrorMessage = By.xpath("//div[contains(@class,'chat-bubble') and contains(text(),'Error: Chatbot service failed')]");
}
