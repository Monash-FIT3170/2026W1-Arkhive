import { useState } from "react";
import DocumentPanel from "./components/document/DocumentPanel";
import ExtractedDataPanel from "./components/extracted-data/ExtractedDataPanel";
import ChatPanel from "./components/chat/ChatPanel";
import type { ChatMessage } from "../../models/Message";

function ValidationPage() {
	const [isChatOpen, setIsChatOpen] = useState(true);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	//bounding box hover state 
	const [hoveredOverlayId, setHoveredOverlayId] = useState<string | null>(null);


	const addMessage = (message: ChatMessage) => {
		setMessages((prev) => [...prev, message]);
	};

	return (
		<>
			<div className="flex flex-col lg:flex-row w-full p-3 gap-3 h-auto lg:h-screen lg:overflow-hidden">
				<div className="w-full h-[50vh] lg:h-full lg:flex-1">

					<DocumentPanel hoveredOverlayId={hoveredOverlayId} />

				</div>
				<div className="w-full h-[50vh] lg:h-full lg:flex-1">
					<ExtractedDataPanel onHover={setHoveredOverlayId} />
				</div>
			</div>

			{/* Floating Chat Modal */}
			<ChatPanel
				isOpen={isChatOpen}
				onToggle={() => setIsChatOpen(!isChatOpen)}
				messages={messages}
				onAddMessage={addMessage}
			/>
		</>
	);
}

export default ValidationPage;