import { useState, useEffect, useRef, useCallback } from "react";
import DocumentPanel from "./components/document/DocumentPanel";
import ExtractedDataPanel from "./components/extracted-data/ExtractedDataPanel";
import ChatPanel from "./components/chat/ChatPanel";
import type { ChatMessage } from "../../models/Message";
import type { OCRComponent } from "../../models/OCRComponent";
import type { UploadedFileGroup } from "../../models/UploadedFileGroup";
import { flattenOcrData } from "./components/extracted-data/FlattenOcrData";
import type { ExtractedData } from "../../models/TableData";
import {
  getExtractionSession,
  saveExtractionSession
} from "../../services/extractionService";
import {
  getUploadedFileGroups,
  getUploadedImageUrl
} from "../../services/uploadService";

function buildFallbackFileGroups(
  ocrData: OCRComponent[]
): UploadedFileGroup[] {
  const groups = new Map<number, UploadedFileGroup>();

  for (const component of ocrData) {
    if (component.fileIndex === undefined) continue;

    const group = groups.get(component.fileIndex) ?? {
      fileIndex: component.fileIndex,
      fileName: component.fileName ?? `File ${groups.size + 1}`,
      pageIndices: []
    };
    if (
      component.pageIndex !== undefined &&
      !group.pageIndices.includes(component.pageIndex)
    ) {
      group.pageIndices.push(component.pageIndex);
    }
    groups.set(component.fileIndex, group);
  }

  if (groups.size > 0) return Array.from(groups.values());

  return [{
    fileIndex: 0,
    fileName: "Uploaded document",
    pageIndices: [0]
  }];
}

function getOcrDataForFile(
  ocrData: OCRComponent[],
  fileIndex: number
): OCRComponent[] {
  const taggedData = ocrData.filter(
    (component) => component.fileIndex === fileIndex
  );
  return taggedData.length > 0 ? taggedData : ocrData;
}

function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState(
    window.innerWidth >= 1024
  );

  useEffect(() => {
    const handleResize = () => setIsLarge(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isLarge;

}

function ValidationPage() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documentContext, setDocumentContext] = useState<ExtractedData | null>(
    null
  );
  const [splitPercent, setSplitPercent] = useState(50);
  const [oldContext, setOldContext] = useState<ExtractedData | null>(null); //for AI suggesiton
  const [documentImageURL, setDocumentImageURL] = useState<string>();
  const [allOcrData, setAllOcrData] = useState<OCRComponent[]>([]);
  const [fileGroups, setFileGroups] = useState<UploadedFileGroup[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(
    null
  );
  const isLarge = useIsLargeScreen();
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    async function loadSession() {
      try {
        const ocrData = (await getExtractionSession()) ?? [];
        let groups: UploadedFileGroup[];
        try {
          groups = await getUploadedFileGroups();
        } catch (error) {
          console.warn("Failed to load uploaded file list", error);
          groups = buildFallbackFileGroups(ocrData);
        }
        if (groups.length === 0) {
          groups = buildFallbackFileGroups(ocrData);
        }

        const firstFile = groups[0];
        const firstFileOcrData = getOcrDataForFile(
          ocrData,
          firstFile.fileIndex
        );

        setAllOcrData(ocrData);
        setFileGroups(groups);
        setSelectedFileIndex(firstFile.fileIndex);
        setDocumentImageURL(
          getUploadedImageUrl(firstFile.pageIndices[0] ?? 0)
        );
        setDocumentContext(flattenOcrData(firstFileOcrData));
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

  const selectedFile = fileGroups.find(
    (file) => file.fileIndex === selectedFileIndex
  );
  const selectedFileOcrData =
    selectedFileIndex === null
      ? allOcrData
      : getOcrDataForFile(allOcrData, selectedFileIndex);
  const displayedPageIndex = selectedFile?.pageIndices[0];
  const displayedPageOcrData =
    displayedPageIndex === undefined
      ? selectedFileOcrData
      : selectedFileOcrData.filter(
          (component) => component.pageIndex === displayedPageIndex
        );

  const handleFileChange = (fileIndex: number) => {
    const file = fileGroups.find((group) => group.fileIndex === fileIndex);
    if (!file) return;

    const fileOcrData = getOcrDataForFile(allOcrData, fileIndex);
    setSelectedFileIndex(fileIndex);
    setDocumentImageURL(getUploadedImageUrl(file.pageIndices[0] ?? 0));
    setDocumentContext(flattenOcrData(fileOcrData));
    setHoveredOverlayId(null);
    setOldContext(null);
  };

  const addMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  };

  // called when AI returns updatedContext after accepting suggestion
  const handleContextUpdate = (updatedData: ExtractedData) => {
    setOldContext(documentContext); // save snapshot before overwriting
    setDocumentContext(updatedData);
  };

  const resolveLastMessage = () => {
    setMessages((prev) =>
      prev.map((msg, i) =>
        i === prev.length - 1 ? { ...msg, resolved: true } : msg
      )
    );
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
    resolveLastMessage(); // hide buttons
    //ai confirmation message
    addMessage({
      id: crypto.randomUUID(),
      role: "model",
      content: "Got it! The changes have been applied and saved.",
      timestamp: new Date().toISOString()
    });
  };

  //handle reject
  const handleReject = () => {
    if (!oldContext) {
      return;
    }
    setDocumentContext(oldContext); // back to old
    setOldContext(null); // old to null
    resolveLastMessage(); // hide buttons
    addMessage({
      id: crypto.randomUUID(),
      role: "model",
      content: "No problem, the changes have been reverted.",
      timestamp: new Date().toISOString()
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
        className="flex flex-col lg:flex-row w-full p-3 gap-3 h-auto lg:h-[calc(100vh-72px)] lg:overflow-hidden"
      >
        <div
          className="w-full h-[50vh] lg:h-full"

          style={isLarge ? { width: `${splitPercent}%` } : { width: "100%" }}

        >
          <DocumentPanel
            hoveredOverlayId={hoveredOverlayId}
            documentImageUrl={documentImageURL}
            ocrData={
              displayedPageOcrData.length > 0
                ? displayedPageOcrData
                : selectedFileOcrData
            }
            files={fileGroups}
            selectedFileIndex={selectedFileIndex}
            onFileChange={handleFileChange}
          />
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

          style={isLarge ? {
            width: `${100 - splitPercent}%`
          } : { width: "100%" }}
        >
          <ExtractedDataPanel
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
