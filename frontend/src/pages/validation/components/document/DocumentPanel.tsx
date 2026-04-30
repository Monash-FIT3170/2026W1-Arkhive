import { useState } from "react";
import mockImage from "../../../../mock-data/test.png";
import mockOcrData from "../../../../mock-data/boundingBox.json";
import type { OCRComponent } from "../../../../models/OCRComponent";

function DocumentPanel() {
	const [viewBox, setViewBox] = useState("0 0 1000 1000"); // default

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

	return (
		<>
			<div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
				{/* Row 1: Title */}
				<h2 className="mb-4 text-xl font-semibold text-base-content">
					DOCUMENT PANEL
				</h2>

				{/* Row 2: Image & Overlay Container */}
				<div className="flex-1 min-h-[250px] relative overflow-hidden border border-base-300">
					<div className="absolute inset-0 w-full h-full">
						<img
							src={mockImage}
							alt="Document"
							className="w-full h-full object-contain"
							onLoad={handleImageLoad}
						/>
						{/* SVG Overlay */}
						<svg
							// set the internal canvas coordinates using viewBox
							viewBox={viewBox}
							// set invisible SVG canvas on top of the image
							className="absolute inset-0 w-full h-full pointer-events-none"
							preserveAspectRatio="xMidYMid meet"
						>
							{/* map all the bounding boxes */}
							{(mockOcrData as OCRComponent[]).map((comp) => {
								if (!comp.boundingBoxes) return null;

								return Object.entries(comp.boundingBoxes).map(
									([cellKey, box]: [string, any]) => {
										// convert vertices to points string for <polygon> points attribute
										const pointsStr = box.vertices
											.map((v: any) => `${v.x},${v.y}`)
											.join(" ");

										return (
											// Styling for individual overlays
											// TODO: Can be updated later with opacity-0 or dynamic hover classes from the table panel.
											<polygon
												key={`${comp.id}-${cellKey}`}
												points={pointsStr}
												className="fill-primary/10 stroke-primary/50 stroke-2 transition-all duration-200"
											/>
										);
									}
								);
							})}
						</svg>
					</div>
				</div>

				{/* Row 3: Confidence Score */}
				<div className="border-t pt-3 text-sm text-base-content/70">
					Confidence Score: <span className="font-medium">92%</span>
				</div>
			</div>
		</>
	);
}

export default DocumentPanel;
