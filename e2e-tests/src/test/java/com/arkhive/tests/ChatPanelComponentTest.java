package com.arkhive.tests;

import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

/**
 * End-to-end test for the AI Chat panel component.
 *
 * <p>Covers the core AI assistant interaction workflow:
 * <ol>
 *   <li>Authenticate as a guest user.</li>
 *   <li>Upload and process a valid document to reach the Validation workspace.</li>
 *   <li>Open the AI Chat panel.</li>
 *   <li>Submit a question regarding the processed document.</li>
 *   <li>Wait for the AI response lifecycle to complete.</li>
 *   <li>Verify that the user message appears and a genuine, non-empty assistant response is displayed.</li>
 * </ol>
 */
public class ChatPanelComponentTest extends BaseTest {

    @BeforeMethod
    public void setupGuestSession() {
        loginAsGuest();
    }

    /**
     * Uploads the valid sample document, triggers processing, and waits until
     * the Validation workspace is fully loaded.
     */
    private void reachValidationWorkspace() {
        String validFilePath = testFileUtils.getTestFilePath("valid-sample.pdf");
        uploadPage.uploadFile(validFilePath);

        Assert.assertTrue(documentPreviewPage.isDisplayed(15),
                "DocumentPreviewPage should be displayed upon uploading a valid file");

        documentPreviewPage.clickProcess();

        int timeout = testConfig.getProcessingTimeoutSeconds();
        Assert.assertTrue(validationPage.isWorkspaceLoaded(timeout),
                "Validation workspace should load within " + timeout + " seconds");
    }

    /**
     * Verifies that a user can submit a message through the Chat panel and receive
     * a completed, non-empty AI assistant response after processing a document.
     *
     * <p>Assertions verify the interaction lifecycle rather than nondeterministic AI text:
     * <ul>
     *   <li>The user message is visible in the chat history.</li>
     *   <li>The loading indicator completes within a reasonable timeout.</li>
     *   <li>The assistant response is displayed, non-empty, and distinguished from
     *       both the static initial greeting and service error notifications.</li>
     * </ul>
     */
    @Test(description = "Verify submitting a document question in the AI Chat panel displays the user message and receives an assistant response",
          timeOut = 200000)
    public void testSubmitQuestionAndReceiveResponse() {
        reachValidationWorkspace();

        // Open the AI Chat panel if not already open
        chatPanelComponent.open();
        Assert.assertTrue(chatPanelComponent.isOpen(),
                "AI Chat panel should be open in the Validation workspace");

        // Ensure the Chat tab is selected and ready for input
        chatPanelComponent.switchToChatTab();

        // Submit a question about the processed document
        String question = "What information was extracted from this document?";
        chatPanelComponent.sendMessage(question);

        // 1. Verify the submitted user message appears in the conversation
        Assert.assertTrue(chatPanelComponent.isUserMessageDisplayed(question),
                "Submitted user message should appear in the chat conversation");

        // 2. Wait for the AI response to complete loading (up to 60 seconds)
        int responseTimeoutSeconds = 60;
        boolean responseCompleted = chatPanelComponent.waitForAssistantResponse(responseTimeoutSeconds);
        Assert.assertTrue(responseCompleted,
                "AI Assistant response should complete loading within " + responseTimeoutSeconds + " seconds");

        // 3. Verify that loading has finished and no service errors are displayed
        Assert.assertFalse(chatPanelComponent.isLoading(),
                "Loading indicator should not be visible after response completion");
        Assert.assertFalse(chatPanelComponent.hasError(),
                "Chat should not display an error notification: " + chatPanelComponent.getErrorMessage());

        // 4. Verify that a non-empty, genuine assistant response is displayed
        String assistantResponse = chatPanelComponent.getLastAssistantResponseText();
        Assert.assertFalse(assistantResponse.isEmpty(),
                "Assistant response should not be empty");
        Assert.assertTrue(chatPanelComponent.isAssistantResponseGenuine(),
                "Assistant response should be a genuine AI answer rather than a placeholder or service error");
    }
}
