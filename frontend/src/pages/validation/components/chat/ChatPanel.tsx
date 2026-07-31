import { Bot, Send, X } from "lucide-react";
import type { ChatMessage } from "../../../../models/Message";
import MessageItem from "./MessageItem";
import { useEffect, useRef, useState } from "react";
import { sendMessage } from "../../../../services/llmService";
import type { ExtractedData } from "../../../../models/TableData";

import OcrReviewWidget from "./OcrReviewWidget";
import type { OcrIssue } from "./OcrReviewWidget";

function ChatPanel({
  isOpen,
  onToggle,
  messages,
  onAddMessage,
  documentContext,
  onContextUpdate,
  onAccept,
  onReject,
  flaggedIssues = [],
  onCarouselAccept,
  onCarouselReject,
  onCarouselManualEdit,
  onSlideChange,
  onFetchSuggestion,
}: {
  isOpen: boolean;
  onToggle: () => void;
  messages: ChatMessage[];
  onAddMessage: (msg: ChatMessage) => void;
  documentContext: ExtractedData;
  onContextUpdate: (updated: ExtractedData) => void; // AI made a change + update table
  onAccept: () => void;
  onReject: () => void;
  flaggedIssues?: OcrIssue[];
  onCarouselAccept?: (fieldId: string, newValue: string) => void;
  onCarouselReject?: (fieldId: string) => void;
  onCarouselManualEdit?: (fieldId: string, newValue: string) => void;
  onSlideChange?: (fieldId: string) => void;
  onFetchSuggestion?: (fieldId: string) => Promise<string | null>;
}) {
  const [input, setInput] = useState("");
  const [isLoading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"chat" | "review">(flaggedIssues.length > 0 ? "review" : "chat");

  useEffect(() => {
    if (flaggedIssues.length > 0) setActiveTab("review");
  }, [flaggedIssues.length]);

  useEffect(() => {
    //whenever messages changes it scrolls to the button of the chat
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    onAddMessage(userMsg);
    setInput("");
    setLoading(true);
    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      content: m.content,
    }));

    try {
      const reply = await sendMessage(allMessages, documentContext);

      //ai returns updated context
      if (reply.updatedContext) {
        onContextUpdate(reply.updatedContext);
      }

      onAddMessage({
        id: crypto.randomUUID(),
        role: "model",
        content: reply.response,
        timestamp: new Date().toISOString(),
        intent: reply.intent ?? undefined, //attacth intent
      });
    } catch (error) {
      onAddMessage({
        id: crypto.randomUUID(),
        role: "model",
        content: "Sorry, something went wrong while analysing the columns.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* AI Button to open and close modal */}
      <div className="fixed bottom-6 right-6 z-50">
        <div className="indicator">
          {!isOpen && flaggedIssues.length > 0 && (
            <span className="indicator-item badge badge-error badge-sm w-3.5 h-3.5 p-0 border-2 border-base-100 rounded-full shadow-sm mt-1 mr-1"></span>
          )}
          <button
            onClick={onToggle}
            className="btn btn-primary btn-circle btn-lg shadow-md"
            title={isOpen ? "Close AI Assistant" : "Open AI Assistant"}
          >
            <Bot className="w-9 h-9" />
          </button>
        </div>
      </div>

      {/* Floating Chat Modal */}
      {isOpen && (
        <div className="fixed bottom-20 right-6 w-[50vw] md:w-96 h-[530px] max-h-[80vh] z-50 flex flex-col bg-base-200 border border-gray-200 rounded-xl">
          {/* window header area */}
          <div className="flex flex-col border-b border-gray-200 bg-base-200/50 rounded-t-xl shrink-0">
            <div className="flex items-center justify-between p-4 pb-2">
              <div className="flex items-center gap-2">
                <Bot className="w-7 h-7 text-primary" />
                <h2 className="font-semibold text-lg">AI Assistant</h2>
              </div>
              <button
                onClick={onToggle}
                className="btn btn-ghost btn-sm btn-circle"
                title="Close Chat"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            {/* Tabs */}
            <div className="flex px-4 gap-6 mt-1">
              <button 
                className={`pb-2 font-medium border-b-2 transition-colors ${activeTab === 'chat' ? 'border-primary text-primary' : 'border-transparent text-base-content/60 hover:text-base-content'}`}
                onClick={() => setActiveTab('chat')}
              >
                Chat
              </button>
              <button 
                className={`pb-2 font-medium border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'review' ? 'border-primary text-primary' : 'border-transparent text-base-content/60 hover:text-base-content'}`}
                onClick={() => setActiveTab('review')}
              >
                Review
                {flaggedIssues.length > 0 && (
                  <span className="badge badge-error badge-sm text-white">{flaggedIssues.length}</span>
                )}
              </button>
            </div>
          </div>

          {activeTab === 'review' ? (
            <div className="flex-1 overflow-hidden">
              <OcrReviewWidget 
                issues={flaggedIssues}
                onAccept={onCarouselAccept!}
                onReject={onCarouselReject!}
                onManualEdit={onCarouselManualEdit!}
                onSlideChange={onSlideChange}
                onFetchSuggestion={onFetchSuggestion}
              />
            </div>
          ) : (
            <>
              {/* messages area */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            <div className="chat chat-start">
              <div className="chat-image avatar">
                <div className="w-10 rounded-full bg-base-300 flex items-center justify-center">
                  <Bot className="w-7 h-7 text-primary" />
                </div>
              </div>
              <div className="chat-header text-xs opacity-50 mb-1">
                AI Assistant
              </div>
              <div
                className="chat-bubble chat-bubble-primary text-primary-content"
                style={{ boxShadow: "var(--color-secondary)" }}
              >
                Hi there, I'm Arkhive's Virtual Assistant. What would you like
                to do today?
              </div>
            </div>
            {messages.map((msg) => (
              <MessageItem
                key={msg.id}
                msg={msg}
                onAccept={onAccept}
                onReject={onReject}
              />
            ))}
            {isLoading && (
              <div className="chat chat-start">
                <div className="chat-image avatar">
                  <div className="w-10 rounded-full bg-base-300 flex items-center justify-center">
                    <Bot className="w-7 h-7 text-primary" />
                  </div>
                </div>
                <div className="chat-header text-xs opacity-50 mb-1">
                  AI Assistant
                </div>
                <div
                  className="chat-bubble chat-bubble-primary text-primary-content"
                  style={{
                    boxShadow: "var(--color-secondary)",
                  }}
                >
                  <span>Just a moment</span>
                  <span className="loading loading-dots loading-sm ml-1.5"></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* text input area */}
          <div className="p-4 border-t border-gray-300 bg-base-300/30">
            <div className="flex gap-2 items-center">
              <textarea
                className="
							textarea textarea-bordered w-full resize-none h-12 min-h-[1rem]
							rounded-xl bg-base-100
							border border-base-300
							focus:border-primary
							transition-[border-color,box-shadow] duration-200 ease-out
							focus:outline-none
							
						"
                placeholder="Type your message here"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e)}
                disabled={isLoading}
              ></textarea>
              <button
                className="btn btn-primary btn-square"
                title="Send message"
                onClick={handleSend}
                disabled={isLoading}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      )}
    </>
  );
}

export default ChatPanel;
