import { AlertTriangle, Download, Check } from "lucide-react"; // NEW: Importing icons for confidence badges and export button
import { useState } from "react";
import type { ExtractedData } from "../../../../models/TableData";
import { exportExtractedDataAsCSV } from "../../../../services/csvDownloadService";

// NEW update: Helper function helps to determine the confidence tier of a row
// Returns the appropriate DaisyUI badge class and label based on the score
// Thresholds: ≥0.85 = high (green), 0.70-0.84 = medium (amber), <0.70 = low (red)
function getConfidenceTier(confidence: number): {
  colour: string;
  label: string;
  isLow: boolean;
  badgeClass?: string;
} {
  const percent = Math.round(confidence * 100);
  console.log(confidence);
  if (confidence >= 0.85) {
    return {
      colour: "#22c55e",
      label: `${percent}% - High`,
      isLow: false,
      badgeClass: "badge-success"
    };
  } else if (confidence >= 0.7) {
    return {
      colour: "#f59e0b",
      label: `${percent}% - Medium`,
      isLow: false,
      badgeClass: "badge-warning"
    };
  } else {
    return {
      colour: "#f59e0b",
      label: `${percent}% - Low`,
      isLow: true, // triggers row highlight and warning icon
      badgeClass: "badge-error"
    };
  }
}

function ExtractedDataPanel({
  onHover,
  extractedData
}: {
  onHover: (id: string | null) => void;
  extractedData: ExtractedData;
}) {
  // Currency formatting function (unchanged)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR"
    }).format(amount);
  };

  // used to check if file exported
  const [exported, setExported] = useState(false);

  // function to import csvService export and trigger CSV download
  function handleExportCSV() {
    exportExtractedDataAsCSV(extractedData);
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  }


  return (
    <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">

      {/* Download Button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-base-content">EXTRACTED DATA</h2>
        <button
          onClick={handleExportCSV}
          disabled={exported}
          className={`btn btn-sm gap-2 text-xs transition-all rounded-xl ${exported
            ? "btn-success"
            : "btn-primary"
            }`}
          title="Export to CSV"
        >
          {exported ? (
            <><Check className="w-3.5 h-3.5" />Exported!</>
          ) : (
            <><Download className="w-3.5 h-3.5" />Export CSV</>
          )}
        </button>
      </div>

      {/* Table */}

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0 max-w-full">
        {/* UPDATED: Removed table-fixed to allow columns to size based on content */}

        {/* UPDATED: Removed table-fixed to allow columns to size based on content */}
        <table className="table table-fixed w-full border border-base-300 text-[10px]">

          {/* Table Header */}
          <thead>
            <tr className="text-base-content/70">
              {/* Existing columns (unchanged) */}
              {extractedData.columns.map((column) => (
                // 	UPDATED: whitespace-nowrap prevents headers from breaking mid-word.
                <th
                  key={column}
                  className="p-3 whitespace-normal break-words text-left text-[12px] font-bold border-b border-base-300"

                >
                  {column.replace(/_/g, " ")}
                </th>
              ))}

              {/* NEW: Confidence column header added at the end of the table */}
              <th className="p-3 text-left text-[12px] font-bold border-b border-base-300 whitespace-normal break-words">
                CONFIDENCE SCORE
              </th>
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {extractedData.rows.map((row) => {
              const tier = getConfidenceTier(row._confidence ?? 1);

              return (
                <tr
                  key={row._id}
                  className={`border-b border-base-300 hover:bg-base-300/40 ${tier.isLow ? "bg-error/10" : ""
                    }`}
                >
                  {extractedData.columns.map((column) => {
                    const cellKey = row._cellKeyMap?.[column];

                    return (
                      <td
                        key={column}
                        className={`p-2 break-words whitespace-normal hover:bg-warning/10 cursor-pointer text-base-content text-[13px]`}
                        onMouseEnter={() =>
                          onHover(
                            cellKey ? `${row._id}:${cellKey}` : String(row._id)
                          )
                        }
                        onMouseLeave={() => onHover(null)}
                      >
                        {row[column] || ""}
                      </td>
                    );
                  })}

                  {/* NEW: Confidence score cell added at the end of each row
										Shows a DaisyUI badge with the score percentage
										Green ≥85%, Amber 70-84%, Red <70%
										Low confidence rows also show a warning icon from lucide-react */}
                  {/* UPDATED: Capsule shape with solid background colours for high visibility */}
                  {/* Alert icon on left only for low confidence rows with hover tooltip */}
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      {tier.isLow && (
                        <span title="please check this output">
                          <AlertTriangle className="w-3 h-3 text-red-500 cursor-pointer flex-shrink-0" />
                        </span>
                      )}
                      {/* UPDATED: Switched from solid fill to outlined badge style */}
                      {/* High confidence uses brand blue, medium amber, low red */}
                      {/* White background keeps it subtle so it doesn't compete with more important UI elements */}
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${tier.badgeClass === "badge-success" ? "border-blue-500 text-blue-500 bg-white" :
                        tier.badgeClass === "badge-warning" ? "border-amber-500 text-amber-500 bg-white" :
                          " border-red-500 text-red-500 bg-white"
                        }`}>
                        {tier.label}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

  );
}

export default ExtractedDataPanel;
