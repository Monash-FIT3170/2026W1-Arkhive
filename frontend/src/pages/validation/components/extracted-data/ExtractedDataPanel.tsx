import mockOcrData from "../../../../mock-data/mockOcrData.json";

// Helper function to format price as currency (since mock is given in IDR)
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
};

function ExtractedDataPanel() {
  const products = mockOcrData?.products ?? [];

  const headers = products.length > 0 ? Object.keys(products[0]) : []; //dynamically get keys

  return (
    <>
      {/* Outer Container */}
      <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 shadow-sm">
        <h2 className="text-xl font-semibold text-base-content p-4">
          EXTRACTED DATA PANEL
        </h2>

        {/* Inner container for spacing */}
        <div className="bg-base-100 rounded-md p-3">
          <div className="overflow-x-auto">
            {/*Header row*/}
            <table className="table w-full border border-base-300 rounded-md">
              <thead>
                <tr className="bg-base-300/30 text-base-content">
                  {headers.map((key) => (
                    <th
                      key={key}
                      className="p-3 text-left border-b border-base-300"
                    >
                      {key.replace(/_/g, " ").toUpperCase()}{" "}
                    </th>
                  ))}
                </tr>
              </thead>

              {/*Body*/}
              <tbody>
                {products.map((product, index) => (
                  <tr
                    key={product.model_code || index}
                    className="hover:bg-base-300/40 border-b border-base-300"
                  >
                    {headers.map((key) => {
                      let value = (product as any)[key];

                      if (
                        key.toLowerCase().includes("price") &&
                        typeof value === "number"
                      ) {
                        value = formatCurrency(value);
                      }

                      return (
                        <td key={key} className="p-3 text-base-content">
                          {typeof value === "object" ? "None" : value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default ExtractedDataPanel;
