import { ChevronsLeft, ChevronsRight, Bot, Send } from "lucide-react";
import type { ChatMessage } from "../../../../models/Message";

function ChatPanel({
	isOpen,
	onToggle
}: {
	isOpen: boolean;
	onToggle: () => void;
	messages: ChatMessage[];
}) {
	// Styling of the chat when the window is collapsed
	if (!isOpen) {
		return (
			<div className="h-full w-full bg-base-200 border border-gray-200 rounded-lg flex flex-col items-center py-4 transition-all">
				{/* Expand Button */}
				<button
					onClick={onToggle}
					className="btn btn-ghost btn-circle"
					title="Expand Chat"
				>
					<ChevronsLeft className="w-6 h-6" />
				</button>
				{/* Vertical AI Assistant label */}
				<div className="flex-1 flex items-center justify-center">
					<span className="[writing-mode:vertical-rl] text-base-content/50 uppercase tracking-widest font-semibold">
						AI Assistant
					</span>
				</div>
			</div>
		);
	}
	// Styling of the chat when the window is expanded
	return (
		<div className="flex flex-col h-full w-full bg-base-200 border border-gray-200 rounded-lg">
			{/* window header area */}
			<div className="flex items-center justify-between p-4 border-b border-gray-200 bg-base-200/50">
				<div className="flex items-center gap-2">
					<Bot className="w-7 h-7 text-primary" />
					<h2 className="font-semibold text-lg">AI Assistant</h2>
				</div>
				<button
					onClick={onToggle}
					className="btn btn-ghost btn-sm btn-circle"
					title="Collapse Chat"
				>
					<ChevronsRight className="w-7 h-7" />
				</button>
			</div>

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
					<div className="chat-bubble chat-bubble-primary text-primary-content">
						Hello! I've extracted the data from your document. You
						can review it in the table. Let me know if anything
						needs correcting.
					</div>
				</div>
				<div className="chat chat-end">
					<div className="chat-bubble chat-bubble-neutral">
						Yo bro, the invoice number looks wrong, it should be
						10024.
					</div>
				</div>
				<div className="chat chat-start">
					<div className="chat-image avatar">
						<div className="w-10 rounded-full bg-base-300 flex items-center justify-center">
							<Bot className="w-7 h-7 text-primary" />
						</div>
					</div>
					<div className="chat-header text-xs opacity-50 mb-1">
						AI Assistant
					</div>
					<div className="chat-bubble chat-bubble-primary text-primary-content">
						Aye Aye Capitain 🫡. I have updated the invoice number
						to 10024. Is there anything else, cap?
					</div>
				</div>
				<div className="chat chat-end">
					<div className="chat-bubble chat-bubble-neutral">
						nah all good, cheers
					</div>
				</div>
			</div>

			{/* text input area */}
			<div className="p-4 border-t border-gray-300 bg-base-300/30">
				<div className="flex gap-2 items-end">
					<textarea
						className="textarea textarea-bordered w-full resize-none h-12 min-h-[1rem] focus:outline-none"
						placeholder="Type a correction or instruction..."
					></textarea>
					<button
						className="btn btn-primary btn-square"
						title="Send message"
					>
						<Send className="w-5 h-5" />
					</button>
				</div>
			</div>
		</div>
	);
}

export default ChatPanel;
