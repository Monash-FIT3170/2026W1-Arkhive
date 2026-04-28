import mockOcrData from "../../../../mock-data/boundingBox.json";
import { flattenOcrData } from "./FlattenOcrData";

function ExtractedDataPanel() {
  const extractedData = flattenOcrData(mockOcrData);

  // Currency formatting function
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
    }).format(amount);
  };

  return (
    <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">
      <h2 className="mb-4 text-xl font-semibold text-base-content">
        EXTRACTED DATA
      </h2>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0 max-w-full">
        <table className="table table-fixed w-full border border-base-300 text-[10px]">
          {/* Table Header */}
          <thead>
            <tr className="text-base-content/70">
              {extractedData.columns.map((column) => (
                <th
                  key={column}
                  className="p-3 text-left text-[12px] font-bold border-b border-base-300 break-words whitespace-normal"
                >
                  {column.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {extractedData.rows.map((row) => (
              <tr
                key={row._id}
                className="border-b border-base-300 hover:bg-base-300/40"
              >
                {extractedData.columns.map((column) => (
                  <td
                    key={column}
                    className={`p-2 text-base-content ${
                      column === "ITEM" ? "break-all" : "break-words"
                    }`}
                  >
                    {column.includes("PRICE") && row[column]
                      ? formatCurrency(
                          Number(String(row[column]).replace(/,/g, "")),
                        )
                      : row[column] || ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ExtractedDataPanel;
