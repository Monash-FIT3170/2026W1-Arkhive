import { useState, useEffect, useRef, useCallback } from 'react';
import DocumentPanel from './components/document/DocumentPanel';
import ExtractedDataPanel from './components/extracted-data/ExtractedDataPanel';
import ChatPanel from './components/chat/ChatPanel';
import type { ChatMessage } from '../../models/Message';
import type { OCRComponent } from '../../models/OCRComponent';
import { flattenOcrData } from './components/extracted-data/FlattenOcrData';
import type { ExtractedData } from '../../models/TableData';
import { getExtractionSession, saveExtractionSession } from '../../services/extractionService';
import { getUploadedImageUrl } from '../../services/uploadService';
import { detectReviewFields } from './components/extracted-data/detectReviewFields';
import { requestFieldReview } from '../../services/llmService';
import OcrReviewWidget from './components/chat/OcrReviewWidget';
import type { OcrIssue } from './components/chat/OcrReviewWidget';

function useIsLargeScreen() {
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsLarge(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isLarge;
}

function ValidationPage() {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documentContext, setDocumentContext] = useState<ExtractedData | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const [oldContext, setOldContext] = useState<ExtractedData | null>(null); //for AI suggesiton
  const [documentImageURL, setDocumentImageURL] = useState<string>();
  const [ocrData, setOCRData] = useState<OCRComponent[]>([]);
  const isLarge = useIsLargeScreen();
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const [flaggedIssues, setFlaggedIssues] = useState<OcrIssue[]>([]);
  const [hasDetected, setHasDetected] = useState(false);
  const [chatActiveTab, setChatActiveTab] = useState<"chat" | "review">("chat");
  
  useEffect(() => {
    async function loadSession() {
      try {
        let ocrData = await getExtractionSession();
        setOCRData(ocrData);
        // console.log("SESSION DATA:", sessionData);
        // console.log("OCR DATA:", sessionData?.ocrData);
        // if (!sessionData?.ocrData) {
        //   sessionData = await saveExtractionSession(mockOcrData); // initialize with mock if no session exists
        // }
        setDocumentImageURL(await getUploadedImageUrl());
        setDocumentContext(flattenOcrData(ocrData as OCRComponent[]));
      } catch (error) {
        console.error('Failed to load extraction session', error);
      }
    }
    loadSession();
  }, []);

  useEffect(() => {
    if (documentContext && !hasDetected) {
      const fields = detectReviewFields(documentContext);
      const issues = fields.map(f => ({
        fieldId: `${f.rowId}:${f.column}`,
        fieldName: f.column,
        ocrValue: String(f.value),
        confidenceScore: f.confidence
      }));
      setFlaggedIssues(issues);
      setHasDetected(true);
      if (issues.length > 0) {
        setChatActiveTab("review");
      }
    }
  }, [documentContext, hasDetected]);

  //Resizing Functions
  //Set dragging to be true
  const onMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
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
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  //bounding box hover state
  const [hoveredTableFieldId, setHoveredTableFieldId] = useState<string | null>(null);
  const [hoveredDocumentOverlayId, setHoveredDocumentOverlayId] = useState<string | null>(null);

  const handleSlideChange = useCallback((fieldId: string | null) => {
    setHoveredTableFieldId(fieldId);
    if (!fieldId) {
      setHoveredDocumentOverlayId(null);
      return;
    }
    const [rowId, column] = fieldId.split(':');
    if (documentContext) {
      const row = documentContext.rows.find(r => String(r._id) === rowId);
      if (row && row._cellKeyMap && row._cellKeyMap[column]) {
        setHoveredDocumentOverlayId(row._cellKeyMap[column]);
        return;
      }
    }
    setHoveredDocumentOverlayId(null);
  }, [documentContext]);

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
      prev.map((msg, i) => (i === prev.length - 1 ? { ...msg, resolved: true } : msg))
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
      console.error('Failed to save session after accept', error);
    }
    setOldContext(null); // old to null
    resolveLastMessage(); // hide buttons
    //ai confirmation message
    addMessage({
      id: crypto.randomUUID(),
      role: 'model',
      content: 'Got it! The changes have been applied and saved.',
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
    resolveLastMessage(); // hide buttons
    addMessage({
      id: crypto.randomUUID(),
      role: 'model',
      content: 'No problem, the changes have been reverted.',
      timestamp: new Date().toISOString(),
    });
  };

  const handleCarouselAccept = (fieldId: string, newValue: string) => {
    if (!documentContext) return;
    const [rowId, column] = fieldId.split(':');
    const newContext = {
      ...documentContext,
      rows: documentContext.rows.map(r => 
        r._id === rowId ? { ...r, [column]: newValue } : r
      )
    };
    setDocumentContext(newContext);
    saveExtractionSession(newContext);
    setFlaggedIssues(prev => prev.filter(issue => issue.fieldId !== fieldId));
  };

  const handleCarouselReject = (fieldId: string) => {
    if (!documentContext) return;
    const [rowId, column] = fieldId.split(':');
    const newContext = {
      ...documentContext,
      rows: documentContext.rows.map(r => 
        r._id === rowId ? { ...r, [column]: '' } : r
      )
    };
    setDocumentContext(newContext);
    saveExtractionSession(newContext);
    setFlaggedIssues(prev => prev.filter(issue => issue.fieldId !== fieldId));
  };

  const handleCarouselManualEdit = (fieldId: string, newValue: string) => {
    if (!documentContext) return;
    const [rowId, column] = fieldId.split(':');
    const newContext = {
      ...documentContext,
      rows: documentContext.rows.map(r => 
        r._id === rowId ? { ...r, [column]: newValue } : r
      )
    };
    setDocumentContext(newContext);
    saveExtractionSession(newContext);
    setFlaggedIssues(prev => prev.filter(issue => issue.fieldId !== fieldId));
  };

  const handleFetchSuggestion = useCallback(async (fieldId: string) => {
    if (!documentContext) return null;
    const [rowId, column] = fieldId.split(':');
    const issue = flaggedIssues.find(i => i.fieldId === fieldId);
    if (!issue) return null;

    const field = { rowId, column, value: issue.ocrValue, confidence: issue.confidenceScore };
    
    try {
      const reply = await requestFieldReview(field, documentContext);
      if (reply.intent?.newValue) {
         return reply.intent.newValue;
      }
      if (reply.updatedContext) {
        const updatedRow = reply.updatedContext.rows.find(r => r._id === rowId || String(r._id) === rowId);
        if (updatedRow && updatedRow[column] !== undefined) {
           return String(updatedRow[column]);
        }
      }
      return reply.response; // fallback to text response
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [documentContext, flaggedIssues]);

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
          style={isLarge ? { width: `${splitPercent}%` } : { width: '100%' }}
        >
          <DocumentPanel
            hoveredOverlayId={hoveredDocumentOverlayId}
            documentImageUrl={documentImageURL}
            ocrData={ocrData}
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
          style={
            isLarge
              ? {
                  width: `${100 - splitPercent}%`,
                }
              : { width: '100%' }
          }
        >
          <ExtractedDataPanel 
            onHover={(id) => {
              if (isChatOpen && chatActiveTab === "review") return;
              setHoveredTableFieldId(id);
              if (id && documentContext) {
                const [rowId, column] = id.split(':');
                const row = documentContext.rows.find(r => String(r._id) === rowId);
                setHoveredDocumentOverlayId(row?._cellKeyMap?.[column] ?? null);
              } else {
                setHoveredDocumentOverlayId(null);
              }
            }} 
            extractedData={documentContext} 
            hoveredOverlayId={hoveredTableFieldId} 
          />
        </div>
      </div>

      {/* Floating Chat Modal / Review Panel */}
      <ChatPanel
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
        messages={messages}
        onAddMessage={addMessage}
        documentContext={documentContext}
        onContextUpdate={handleContextUpdate}
        onAccept={handleAccept}
        onReject={handleReject}
        flaggedIssues={flaggedIssues}
        onCarouselAccept={handleCarouselAccept}
        onCarouselReject={handleCarouselReject}
        onCarouselManualEdit={handleCarouselManualEdit}
        onSlideChange={handleSlideChange}
        onFetchSuggestion={handleFetchSuggestion}
        activeTab={chatActiveTab}
        onTabChange={setChatActiveTab}
      />
    </>
  );
}

export default ValidationPage;
