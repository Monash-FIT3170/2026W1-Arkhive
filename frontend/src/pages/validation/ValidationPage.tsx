import { useState, useEffect } from "react";
import DocumentPanel from "./components/document/DocumentPanel";
import ExtractedDataPanel from "./components/extracted-data/ExtractedDataPanel";
import ChatPanel from "./components/chat/ChatPanel";
import type { ChatMessage } from "../../models/Message";
import type { OCRComponent } from "../../models/OCRComponent";
import mockOcrData from "../../mock-data/boundingBox.json";
import { flattenOcrData } from "./components/extracted-data/FlattenOcrData";
import { getExtractionSession, saveExtractionSession } from "../../services/extractionService";

function ValidationPage() {
	const [isChatOpen, setIsChatOpen] = useState(true);
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [documentContext, setDocumentContext] = useState<any>(null);

	useEffect(() => {
		async function loadSession() {
			try {
				let sessionData = await getExtractionSession();
				if (!sessionData?.ocrData) {
					sessionData = await saveExtractionSession(mockOcrData);
				}
				setDocumentContext(flattenOcrData(sessionData.ocrData as OCRComponent[]));
			} catch (error) {
				console.error("Failed to load extraction session", error);
			}
		}
		loadSession();
	}, []);

	//test
	//bounding box hover state 
	const [hoveredOverlayId, setHoveredOverlayId] = useState<string | null>(null);

	const ExtractedDataPanelComponent = ExtractedDataPanel as any;

	const addMessage = (message: ChatMessage) => {
		setMessages((prev) => [...prev, message]);
	};

	if (!documentContext) {
		return <div className="flex h-screen items-center justify-center font-semibold text-lg">Loading...</div>;
	}

	return (
		<>
			<div className="flex flex-col lg:flex-row w-full p-3 gap-3 h-auto lg:h-screen lg:overflow-hidden">
				<div className="w-full h-[50vh] lg:h-full lg:flex-1">

					<DocumentPanel hoveredOverlayId={hoveredOverlayId} />

				</div>
				<div className="w-full h-[50vh] lg:h-full lg:flex-1">
					<ExtractedDataPanelComponent onHover={setHoveredOverlayId} extractedData={documentContext} />
				</div>
			</div>

			{/* Floating Chat Modal */}
			<ChatPanel
				isOpen={isChatOpen}
				onToggle={() => setIsChatOpen(!isChatOpen)}
				messages={messages}
				onAddMessage={addMessage}
				documentContext={documentContext}
				onIntentApplied={(updatedData) => setDocumentContext(updatedData)}
			/>
		</>
	);
}

export default ValidationPage;

