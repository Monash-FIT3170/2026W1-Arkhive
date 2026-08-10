import { AlertTriangle, Download, Check } from "lucide-react"; // NEW: Importing icons for confidence badges and export button
import { useState } from "react";
import type { ExtractedData } from "../../../../models/TableData";
import { exportExtractedDataAsCSV } from "../../../../services/csvDownloadService";
import { exportExtractedDataAsJSON } from "../../../../services/jsonDownloadService";
import { exportExtractedDataAsTXT } from "../../../../services/txtDownloadService"; // NEW: TXT export service
import { exportExtractedDataAsXLSX } from "../../../../services/xlsxDownloadService"; // NEW: Excel export service (US-4.5)


// NEW update: Helper function helps to determine the confidence tier of a row
// Returns the appropriate DaisyUI badge class and label based on the score
// Thresholds: >=0.85 = high (green), 0.70-0.84 = medium (amber), <0.70 = low (red)
function getConfidenceTier(confidence: number): {
  colour: string;
  label: string;
  isLow: boolean;
  badgeClass?: string;
} {
  const percent = Math.round(confidence * 100);
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

  // used to check if file exported, and which format was last exported
  // UPDATED: was a plain boolean for CSV only; now tracks which format
  // (csv/txt/xlsx) was exported so a single button/dropdown can serve all three
  const [exportedFormat, setExportedFormat] = useState<null | "csv" | "txt" | "xlsx" | "json">(null);

  // function to import csv/txt/xlsx/json download services and trigger the download
  // for whichever format the user picked from the dropdown
  // UPDATED: replaces the old handleExportCSV, now handles all export formats
  function handleExport(format: "csv" | "txt" | "xlsx" | "json") {
    if (format === "csv") {
      exportExtractedDataAsCSV(extractedData);
    } else if (format === "txt") {
      exportExtractedDataAsTXT(extractedData);
    } else if (format === "xlsx") {
      exportExtractedDataAsXLSX(extractedData);
    } else if (format === "json") {
      exportExtractedDataAsJSON(extractedData);
    }

    setExportedFormat(format);
    setTimeout(() => setExportedFormat(null), 2500);

    // close the dropdown menu after a selection is made
    (document.activeElement as HTMLElement)?.blur();
  }


  return (
    <div className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col">

      {/* Export Button */}
      {/* UPDATED: was a single "Download Button" for CSV only; now a dropdown
          so more export formats (TXT, Excel, and future formats) can share one button */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-base-content">EXTRACTED DATA</h2>

        <div className="dropdown dropdown-end">
          <button
            tabIndex={0}
            className={`btn btn-sm gap-2 text-xs transition-all rounded-xl ${exportedFormat
              ? "btn-success"
              : "btn-primary"
              }`}
          >
            {exportedFormat ? (
              <><Check className="w-3.5 h-3.5" />Downloaded!</>
            ) : (
              <><Download className="w-3.5 h-3.5" />Download</>
            )}
          </button>
          <ul
            tabIndex={0}
            className="dropdown-content menu bg-base-100 rounded-box z-10 w-45 p-2 shadow-md border border-base-300"
          >
            <li>
              <a onClick={() => handleExport("csv")}>Download as CSV</a>
            </li>
            <li>
              <a onClick={() => handleExport("txt")}>Download as TXT</a>
            </li>
            {/* NEW: Excel export option (US-4.5) */}
            <li>
              <a onClick={() => handleExport("xlsx")}>Download as Excel</a>
            </li>
            <li>
              <a onClick={() => handleExport("json")}>Download as JSON</a>
            </li>
          </ul>
        </div>
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
										Green >=85%, Amber 70-84%, Red <70%
										Low confidence rows also show a warning icon from lucide-react */}
                  {/* UPDATED: Capsule shape with solid background colours for high visibility */}
                  {/* Alert icon on left only for low confidence rows with hover tooltip */}
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      {tier.isLow && (
                        <span title="please check this output">
                          <AlertTriangle className="w-3 h-3 text-error cursor-pointer flex-shrink-0" />
                        </span>
                      )}
                      {/* UPDATED: Switched from solid fill to outlined badge style */}
                      {/* High confidence uses brand blue, medium amber, low red */}
                      {/* White background keeps it subtle so it doesn't compete with more important UI elements */}
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${tier.badgeClass === "badge-success" ? "border-success text-success bg-white" :
                        tier.badgeClass === "badge-warning" ? "border-warning text-warning bg-white" :
                          " border-error text-error bg-white"
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