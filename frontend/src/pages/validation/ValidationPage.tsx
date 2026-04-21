import { useState } from "react";
import DocumentPanel from "./components/document/DocumentPanel";
import ExtractedDataPanel from "./components/extracted-data/ExtractedDataPanel";
import ChatPanel from "./components/chat/ChatPanel";

function ValidationPage() {
	const [isChatOpen, setIsChatOpen] = useState(true);

	return (
		<>
			<div className="flex w-full p-3 gap-3 overflow-hidden h-screen">
				<div className="flex-1 h-full">
					<DocumentPanel />
				</div>
				<div className="flex-1 h-full">
					<ExtractedDataPanel />
				</div>
				<div
					className={`transition-all duration-300 ease-in-out h-full ${isChatOpen ? "flex-[0.8]" : "flex-[0.05]"}`}
				>
					<ChatPanel
						isOpen={isChatOpen}
						onToggle={() => setIsChatOpen(!isChatOpen)}
					/>
				</div>
			</div>
		</>
	);
}

export default ValidationPage;
