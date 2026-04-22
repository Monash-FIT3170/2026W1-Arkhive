import mockImage from "../../../../mock-data/test.png";

function DocumentPanel() {
  return (
    <>
      <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
        <h2 className="mb-4 text-xl font-semibold text-base-content">
          DOCUMENT PANEL
        </h2>

        {/*Added container for image*/}
        <div className="flex-1 w-full overflow-hidden rounded-md">
          <img
            src={mockImage}
            alt="Mock Image for Document Panel"
            className="w-full h-auto object-cover rounded-lg"
          />
        </div>

        {/*Confidence scoring*/}
        <div className="mt-4 border-t border-base-300 pt-3 text-sm text-base-content/70">
          Confidence Score:{" "}
          <span className="font-medium text-base-content">92%</span>
        </div>
      </div>
    </>
  );
}

export default DocumentPanel;
