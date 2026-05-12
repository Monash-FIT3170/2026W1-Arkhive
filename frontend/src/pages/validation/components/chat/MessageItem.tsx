import { Bot } from "lucide-react";
import type { ChatMessage } from "../../../../models/Message";
//import ReactMarkdown from "react-markdown";

function MessageItem({
  msg,
  onAccept,
  onReject,
}: {
  msg: ChatMessage;
  onAccept?: () => void;
  onReject: () => void;
}) {
  const isUser = msg.role === "user";

  const showActions =
    !isUser &&
    !msg.resolved &&
    msg.intent &&
    (msg.intent.type === "column_confirm" ||
      msg.intent.type === "column_correction" ||
      msg.intent.type === "column_delete" ||
      msg.intent.type === "correction");

  return (
    <div className={`chat ${isUser ? "chat-end" : "chat-start"}`}>
      {/* Avatar icon for LLM */}
      {!isUser && (
        <div className="chat-image avatar">
          <div className="w-10 rounded-full bg-base-300 flex items-center justify-center">
            <Bot className="w-7 h-7 text-primary" />
          </div>
        </div>
      )}

      {/* Header for LLM */}
      {!isUser && (
        <div className="chat-header text-xs opacity-50 mb-1">AI Assistant</div>
      )}

      {/* Message bubble */}
      <div
        className={`chat-bubble ${
          isUser
            ? "chat-bubble-neutral"
            : "chat-bubble-primary text-primary-content"
        } left-0`}
        style={{ boxShadow: "--color-secondary" }}
      >
        {msg.content}
      </div>

      {/* Accept/Reject buttons */}
      {showActions && (
        <div className="flex gap-2 mt-3">
          <button className="btn btn-sm btn-success" onClick={onAccept}>
            Accept
          </button>
          <button className="btn btn-sm btn-error" onClick={onReject}>
            Reject
          </button>
        </div>
      )}

      {/*Use Local time to add timestamp - NOTE: on deployment will need GMT -> Melbourne Time converter*/}
      <div className="chat-footer text-xs opacity-50 mt-1">
        {new Date(msg.timestamp).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
    </div>
  );
}

export default MessageItem;
