import mockOcrData from "../../../../mock-data/mockOcrData.json";

function ExtractedDataPanel() {
  const { items } = mockOcrData;

  // Helper function to format price as currency (since mock is given in RP)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
    }).format(amount);
  };

  return (
    <>
      <div className="h-full w-full bg-base-200 border border-gray-200 rounded-lg">
        <h2 className="text-xl font-semibold text-base-content p-4">
          EXTRACTED DATA PANEL
        </h2>

        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr className="text-base-content/70">
                <th className="text-left p-2">Item</th>
                <th className="text-left p-2">Quantity</th>
                <th className="text-left p-2">Price</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.item} className="hover:bg-base-300/40">
                  <td className="p-3 text-base-content">{item.item}</td>
                  <td className="p-3 text-base-content">{item.quantity}</td>
                  <td className="p-3 text-right text-base-content">
                    {formatCurrency(item.price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default ExtractedDataPanel;
