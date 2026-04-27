import { Bot } from "lucide-react";
import type { ChatMessage } from "../../../../models/Message";

function MessageItem({ msg }: { msg: ChatMessage }) {
	const isUser = msg.role === "user";  // ✅

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
				<div className="chat-header text-xs opacity-50 mb-1">
					AI Assistant
				</div>
			)}

			{/* Message bubble */}
			<div
				className={`chat-bubble ${isUser
					? "chat-bubble-neutral"
					: "chat-bubble-primary text-primary-content"
					}`}
			>
				{msg.content}
			</div>
		</div>
	);
}

export default MessageItem;
