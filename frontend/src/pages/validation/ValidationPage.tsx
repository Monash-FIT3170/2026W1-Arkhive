import { useState } from "react";
import DocumentPanel from "./components/document/DocumentPanel";
import ExtractedDataPanel from "./components/extracted-data/ExtractedDataPanel";
import ChatPanel from "./components/chat/ChatPanel";
import type { ChatMessage } from "../../models/Message";
import type { OCRComponent } from "../../models/OCRComponent";
import mockOcrData from "../../mock-data/boundingBox.json";
import { flattenOcrData } from "./components/extracted-data/FlattenOcrData";
function ValidationPage() {
	const [isChatOpen, setIsChatOpen] = useState(true);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const documentContext = flattenOcrData(mockOcrData as OCRComponent[]);
	const addMessage = (message: ChatMessage) => {
		setMessages((prev) => [...prev, message]);
	};

	return (
		<>
			<div className="flex flex-col lg:flex-row w-full p-3 gap-3 h-auto lg:h-screen lg:overflow-hidden">
				<div className="w-full h-[50vh] lg:h-full lg:flex-1">
					<DocumentPanel />
				</div>
				<div className="w-full h-[50vh] lg:h-full lg:flex-1 overflow-x-auto">
					{/* UPDATED: overflow-x-auto allows horizontal scrolling on the right panel */}
					{/* so all columns are accessible without squishing the left panel */}
					<ExtractedDataPanel extractedData={documentContext} />
				</div>
			</div>

			{/* Floating Chat Modal */}
			<ChatPanel
				isOpen={isChatOpen}
				onToggle={() => setIsChatOpen(!isChatOpen)}
				messages={messages}
				onAddMessage={addMessage}
				documentContext={documentContext}
			/>
		</>
	);
}

export default ValidationPage;
