import mockImage from "../../../../mock-data/test.png";

function DocumentPanel() {
  return (
    <>
      <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
        <h2 className="mb-4 text-xl font-semibold text-base-content">
          DOCUMENT PANEL
        </h2>

        {/*Added container for image*/}
        <div className="flex flex-col lg:flex-row h-full w-full gap-4">
          {/* Image panel */}
          <div className="flex-1 min-h-[250px] lg:min-h-full flex items-center justify-center">
            <img
              src={mockImage}
              alt="Document"
              className="w-full h-full object-contain"
            />
          </div>

          {/* Content panel */}
          <div className="w-full lg:w-1/3 flex flex-col">

            <div className="mt-auto border-t pt-3 text-sm text-base-content/70">
              Confidence Score: <span className="font-medium">92%</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default DocumentPanel;
