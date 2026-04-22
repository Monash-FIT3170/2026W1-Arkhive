import mockImage from "../../../../mock-data/test.png";

function DocumentPanel() {
  return (
    <>
      <div className="h-full w-full bg-base-200 border border-gray-200 rounded-lg">
        <h1>Document PANEL</h1>
        <img
          src={mockImage}
          alt="Mock Image for Document Panel"
          className="w-full h-auto object-cover rounded-lg"
        />
      </div>
    </>
  );
}

export default DocumentPanel;
