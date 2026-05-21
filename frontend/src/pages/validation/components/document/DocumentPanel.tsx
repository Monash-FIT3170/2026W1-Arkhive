import { useState, useRef } from "react";
import type { OCRComponent } from "../../../../models/OCRComponent";
// NEW update: Calculating real average confidence from OCR data
function calculateAverageConfidence(data: OCRComponent[]): number {
  const componentsWithConfidence = data.filter(
    (comp) => typeof comp.confidence === "number"
  );
  if (componentsWithConfidence.length === 0) return 0;
  const total = componentsWithConfidence.reduce(
    (sum, comp) => sum + comp.confidence,
    0
  );
  return total / componentsWithConfidence.length;
}

function DocumentPanel({
  hoveredOverlayId,
  documentImageUrl,
  ocrData
}: {
  hoveredOverlayId: string | null;
  documentImageUrl: string | undefined;
  ocrData: OCRComponent[];
}) {
  const [zoom, setZoom] = useState(1);
  const [viewBox, setViewBox] = useState("0 0 1000 1000"); // default
  // NEW update: Real average confidence from mock data
  const averageConfidence = calculateAverageConfidence(
    ocrData as OCRComponent[]
  );
  const confidencePercent = Math.round(averageConfidence * 100);

  // Panning state
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      // original image is 2200x1700 (200 DPI).
      // OCR coordinates are generated at ~1.5x smaller scale (~133 DPI).
      // scale factor of ocr -> image (200 dpi /133 dpi) = 1.5037593985
      const scaleFactor = 1.5037593985;
      const ocrWidth = naturalWidth / scaleFactor;
      const ocrHeight = naturalHeight / scaleFactor;
      setViewBox(`0 0 ${ocrWidth} ${ocrHeight}`);
    }
  };
  // The dragging and scrolling functions below were done with the help of Goolge Gemini
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setStartY(e.pageY - containerRef.current.offsetTop);
    setScrollLeft(containerRef.current.scrollLeft);
    setScrollTop(containerRef.current.scrollTop);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const y = e.pageY - containerRef.current.offsetTop;
    const walkX = x - startX;
    const walkY = y - startY;
    containerRef.current.scrollLeft = scrollLeft - walkX;
    containerRef.current.scrollTop = scrollTop - walkY;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  return (
    <>
      <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
        {/* Row 1: Title */}
        <h2 className="mb-4 text-xl font-semibold text-base-content">
          DOCUMENT PANEL
        </h2>
        {/* Row 2: Zoom buttoms*/}
        <div className="mb-2 flex gap-2">
          <button
            className="btn btn-sm"
            onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
          >
            −
          </button>

          <button
            className="btn btn-sm"
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
          >
            +
          </button>

          <button className="btn btn-sm" onClick={() => setZoom(1)}>
            Reset
          </button>
        </div>
        {/* Row 3: Image & Overlay Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
          className={`flex-1 min-h-[250px] relative overflow-auto border border-base-300 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
        >
          <div
            className="absolute inset-0 w-full h-full origin-center"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              transition: "transform 0.2s ease"
            }}
          >
            <img
              src={documentImageUrl}
              alt="Document"
              className="w-full h-full object-contain"
              onLoad={handleImageLoad}
            />
            {/* SVG Overlay */}
            <svg
              // set the internal canvas coordinates using viewBox
              viewBox={viewBox}
              // set invisible SVG canvas on top of the image
              className="absolute inset-0 w-full h-full"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                <filter
                  id="highlightGlow"
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="300%"
                >
                  <feGaussianBlur stdDeviation="4" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {/* map all the bounding boxes */}
              {(ocrData as OCRComponent[]).map((comp) => {
                if (!comp.boundingBoxes) return null;

                return Object.entries(comp.boundingBoxes).map(
                  ([cellKey, box]: [string, any]) => {
                    const id = `${comp.id}:${cellKey}`;

                    const pointsStr = box.vertices
                      .map((v: any) => `${v.x},${v.y}`)
                      .join(" ");

                    const isActive =
                      hoveredOverlayId === id || hoveredOverlayId === comp.id;

                    return (
                      <polygon
                        key={id}
                        points={pointsStr}
                        fill={
                          isActive ? "rgba(245, 158, 11, 0.35)" : "transparent"
                        }
                        stroke={isActive ? "#f59e0b" : "transparent"}
                        strokeWidth={isActive ? 3 : 1}
                        opacity={isActive ? 1 : 0.75}
                        filter={isActive ? "url(#highlightGlow)" : undefined}
                      />
                    );
                  }
                );
              })}
            </svg>
          </div>
        </div>

        {/* Row 3: Confidence Score, updated to show real score instead of hardcoded value, made the colours a little brighter for the document panel */}
        <div className="border-t pt-3 text-sm text-base-content/70">
          Confidence Score:{" "}
          <span
            className={`font-medium ${
              confidencePercent >= 85
                ? "text-green-400"
                : confidencePercent >= 70
                  ? "text-yellow-400"
                  : "text-red-400"
            }`}
          >
            {confidencePercent}%
          </span>
        </div>
      </div>
    </>
  );
}

export default DocumentPanel;
