import { useState } from "react";
import DocumentPanel from "./components/document/DocumentPanel";
import ExtractedDataPanel from "./components/extracted-data/ExtractedDataPanel";
import ChatPanel from "./components/chat/ChatPanel";
import type { ChatMessage } from "../../models/Message";

function ValidationPage() {
	const [isChatOpen, setIsChatOpen] = useState(true);
	const [messages, setMessages] = useState<ChatMessage[]>([]);

	const addMessage = (message: ChatMessage) => {
		setMessages((prev) => [...prev, message]);
	};

	return (
		<>
			<div className="flex flex-col lg:flex-row w-full p-3 gap-3 h-auto lg:h-screen lg:overflow-hidden">
				<div className="w-full h-[50vh] lg:h-full lg:flex-1">
					<DocumentPanel />
				</div>
				<div className="w-full h-[50vh] lg:h-full lg:flex-1">
					<ExtractedDataPanel />
				</div>
				<div
					className={`transition-all duration-300 ease-in-out w-full lg:h-full ${isChatOpen
						? "h-[50vh] lg:h-auto lg:flex-[0.8]"
						: "h-20 lg:h-auto lg:flex-[0.05]"
						}`}
				>
					<ChatPanel
						isOpen={isChatOpen}
						onToggle={() => setIsChatOpen(!isChatOpen)}
						messages={messages}
						onAddMessage={addMessage}
					/>
				</div>
			</div>
		</>
	);
}

export default ValidationPage;
