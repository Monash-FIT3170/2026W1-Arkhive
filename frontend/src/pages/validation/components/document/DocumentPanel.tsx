import mockImage from "../../../../mock-data/test.png";

function DocumentPanel() {
  return (
    <>
      <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
        {/* Row 1: Title */}
        <h2 className="mb-4 text-xl font-semibold text-base-content">
          DOCUMENT PANEL
        </h2>

        {/* Row 2: Image */}
        <div className="flex-1 min-h-[250px] flex items-center justify-center">
          <img
            src={mockImage}
            alt="Document"
            className="w-full h-full object-contain"
          />
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