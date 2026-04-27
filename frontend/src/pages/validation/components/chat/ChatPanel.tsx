import { ChevronsLeft, ChevronsRight, ChevronsUp, ChevronsDown, Bot, Send } from "lucide-react";
import type { ChatMessage } from "../../../../models/Message";
import MessageItem from "./MessageItem";
import { useEffect, useRef, useState } from "react";
import { sendMessageToGemini } from "./aiService";


function ChatPanel({
	isOpen,
	onToggle,
	messages,
	onAddMessage
}: {
	isOpen: boolean;
	onToggle: () => void;
	messages: ChatMessage[];
	onAddMessage: (msg: ChatMessage) => void;
}) {
	const [input, setInput] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);

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
			timestamp: new Date().toISOString()
		};

		onAddMessage(userMsg);
		setInput("");

		const allMessages = [...messages, userMsg].map(m => ({
			role: m.role === "user" ? "user" as const : "model" as const,
			content: m.content
		}));

		const reply = await sendMessageToGemini(allMessages);

		onAddMessage({
			id: crypto.randomUUID(),
			role: "model",
			content: reply,
			timestamp: new Date().toISOString()
		});
	};
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	// Styling of the chat when the window is collapsed
	if (!isOpen) {
		return (
			<div className="h-full w-full bg-base-200 border border-gray-200 rounded-lg flex flex-row lg:flex-col items-center justify-between lg:justify-start px-4 lg:px-0 py-0 lg:py-4 transition-all">
				{/* horizontal AI assistant label (mobile only) */}
				<div className="flex items-center justify-center lg:hidden">
					<span className="text-base-content/50 uppercase tracking-widest font-semibold">
						AI Assistant
					</span>
				</div>

				{/* Expand Button */}
				<button
					onClick={onToggle}
					className="btn btn-ghost btn-circle"
					title="Expand Chat"
				>
					<ChevronsLeft className="w-6 h-6 hidden lg:block" />
					<ChevronsDown className="w-6 h-6 lg:hidden" />
				</button>

				{/* Vertical AI Assistant label (Desktop only) */}
				<div className="hidden lg:flex flex-1 items-center justify-center lg:mt-4">
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
					<ChevronsRight className="w-7 h-7 hidden lg:block" />
					<ChevronsUp className="w-7 h-7 lg:hidden" />
				</button>
			</div>

			{/* messages area */}
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

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
				{messages.map((msg) => (
					<MessageItem key={msg.id} msg={msg} />
				))}
				<div ref={messagesEndRef} />
			</div>

			{/* text input area */}
			<div className="p-4 border-t border-gray-300 bg-base-300/30">
				<div className="flex gap-2 items-end">
					<textarea
						className="textarea textarea-bordered w-full resize-none h-12 min-h-[1rem] focus:outline-none"
						placeholder="Type a correction or instruction..."
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => handleKeyDown(e)}
					></textarea>
					<button
						className="btn btn-primary btn-square"
						title="Send message"
						onClick={handleSend}
					>
						<Send className="w-5 h-5" />
					</button>
				</div>
			</div>
		</div>
	);
}

export default ChatPanel;
