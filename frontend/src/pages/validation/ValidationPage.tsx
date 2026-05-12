import { useState, useEffect, useRef, useCallback } from "react";
import DocumentPanel from "./components/document/DocumentPanel";
import ExtractedDataPanel from "./components/extracted-data/ExtractedDataPanel";
import ChatPanel from "./components/chat/ChatPanel";
import type { ChatMessage } from "../../models/Message";
import type { OCRComponent } from "../../models/OCRComponent";
import mockOcrData from "../../mock-data/boundingBox.json";
import { flattenOcrData } from "./components/extracted-data/FlattenOcrData";
import type { ExtractedData } from "../../models/TableData";
import {
  getExtractionSession,
  saveExtractionSession,
} from "../../services/extractionService";

function ValidationPage() {
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documentContext, setDocumentContext] = useState<any>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [oldContext, setOldContext] = useState<ExtractedData | null>(null); //for AI suggesiton

  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    async function loadSession() {
      try {
        let sessionData = await getExtractionSession();
        if (!sessionData?.ocrData) {
          sessionData = await saveExtractionSession(mockOcrData);
        }
        setDocumentContext(
          flattenOcrData(sessionData.ocrData as OCRComponent[]),
        );
      } catch (error) {
        console.error("Failed to load extraction session", error);
      }
    }
    loadSession();
  }, []);

  //Resizing Functions
  //Set dragging to be true
  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  //Given mouse even that is moving, we calculate the presentage of mouse relative to container size
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const percent = (offsetX / rect.width) * 100;

    // Clamp between 20% and 80%
    setSplitPercent(Math.min(80, Math.max(20, percent)));
  }, []);

  //On mouse up, we set dragging to be false
  const onMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  //bounding box hover state
  const [hoveredOverlayId, setHoveredOverlayId] = useState<string | null>(null);

  const ExtractedDataPanelComponent = ExtractedDataPanel as any;

  const addMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  // called when AI returns updatedContext after accepting suggestion
  const handleContextUpdate = (updatedData: any) => {
    setOldContext(documentContext); // save snapshot before overwriting
    setDocumentContext(updatedData);
  };

  //handle accept
  const handleAccept = async () => {
    if (!documentContext) {
      return;
    }
    try {
      await saveExtractionSession(documentContext); // accept content
    } catch (error) {
      console.error("Failed to save session after accept", error);
    }
    setOldContext(null); // old to null

    //ai confirmation message
    addMessage({
      id: crypto.randomUUID(),
      role: "model",
      content: "Got it! The changes have been applied and saved.",
      timestamp: new Date().toISOString(),
    });
  };

  //handle reject
  const handleReject = () => {
    if (!oldContext) {
      return;
    }
    setDocumentContext(oldContext); // back to old
    setOldContext(null); // old to null

    addMessage({
      id: crypto.randomUUID(),
      role: "model",
      content: "No problem, the changes have been reverted.",
      timestamp: new Date().toISOString(),
    });
  };

  if (!documentContext) {
    return (
      <div className="flex h-screen items-center justify-center font-semibold text-lg">
        Loading...
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className="flex flex-col lg:flex-row w-full p-3 gap-3 h-auto lg:h-screen lg:overflow-hidden"
      >
        <div
          className="w-full h-[50vh] lg:h-full"
          style={{ width: `${splitPercent}%` }}
        >
          <DocumentPanel hoveredOverlayId={hoveredOverlayId} />
        </div>

        <div
          onMouseDown={onMouseDown}
          onDoubleClick={() => setSplitPercent(50)}
          className="hidden lg:flex items-center justify-center w-2 mx-1 cursor-col-resize flex-shrink-0 group"
        >
          <div className="w-1 h-12 rounded-full bg-gray-300 group-hover:bg-blue-400 transition-colors duration-150" />
        </div>

        <div
          className="w-full h-[50vh] lg:h-full"
          style={{ width: `${100 - splitPercent}%` }}
        >
          <ExtractedDataPanelComponent
            onHover={setHoveredOverlayId}
            extractedData={documentContext}
          />
        </div>
      </div>

      {/* Floating Chat Modal */}
      <ChatPanel
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
        messages={messages}
        onAddMessage={addMessage}
        documentContext={documentContext}
        onContextUpdate={handleContextUpdate}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    </>
  );
}

export default ValidationPage;
