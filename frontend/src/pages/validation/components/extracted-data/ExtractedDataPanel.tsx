import { AlertTriangle, Download, Check, X } from "lucide-react"; // NEW: Importing icons for confidence badges and export button
import { useState, useEffect } from "react";
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
  extractedData,
  hoveredOverlayId,
  onCellEdit
}: {
  onHover: (id: string | null) => void;
  extractedData: ExtractedData;
  hoveredOverlayId?: string | null;
  onCellEdit?: (fieldId: string, newValue: string) => void;
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
  const [isMouseInside, setIsMouseInside] = useState(false);

  // Editing state
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [initialEditValue, setInitialEditValue] = useState<string>("");
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [showSuccessMessage, setShowSuccessMessage] = useState<boolean>(false);
  const [showDiscardMessage, setShowDiscardMessage] = useState<boolean>(false);

  // function to import csvService export and trigger CSV download
  function handleExportCSV() {
    exportExtractedDataAsCSV(extractedData);
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  }
  
  useEffect(() => {
    if (hoveredOverlayId && !isMouseInside) {
      // hoveredOverlayId is now fieldId (e.g. comp_4:SUB_ITEM_2)
      // replace colons to make it a valid DOM id
      const safeId = hoveredOverlayId.replace(/:/g, '-');
      const el = document.getElementById(`cell-${safeId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [hoveredOverlayId, isMouseInside]);

  const handleCellClick = (fieldId: string, initialValue: string) => {
    setEditingCellId(fieldId);
    setEditValue(initialValue);
    setInitialEditValue(initialValue);
  };

  const handleCellBlur = (fieldId: string) => {
    if (editValue !== initialEditValue) {
      setLocalEdits(prev => ({
        ...prev,
        [fieldId]: editValue
      }));
      if (onCellEdit) {
        onCellEdit(fieldId, editValue);
      }
      
      setShowSuccessMessage(true);
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 2000);
    }
    setEditingCellId(null);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, fieldId: string) => {
    if (e.key === 'Enter') {
      handleCellBlur(fieldId);
    } else if (e.key === 'Escape') {
      if (editValue !== initialEditValue) {
        setShowDiscardMessage(true);
        setTimeout(() => {
          setShowDiscardMessage(false);
        }, 2000);
      }
      setEditingCellId(null);
    }
  };


  return (
    <div 
      className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col"
      onMouseEnter={() => setIsMouseInside(true)}
      onMouseLeave={() => setIsMouseInside(false)}
    >

      {/* Download Button & Notifications */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-base-content">EXTRACTED DATA</h2>
          {showSuccessMessage && (
            <span className="text-success text-xs font-semibold animate-fade-in-out flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              Success, changes saved!
            </span>
          )}
          {showDiscardMessage && (
            <span className="text-error text-xs font-semibold animate-fade-in-out flex items-center gap-1">
              <X className="w-3.5 h-3.5" />
              Changes discarded
            </span>
          )}
        </div>
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
      <div className="flex-1 overflow-auto min-h-0 max-w-full">
        <table className="table table-fixed w-full border border-base-300 text-[10px]">

          {/* Table Header */}
          <thead>
            <tr className="text-base-content/70">
              {/* Existing columns (unchanged) */}
              {extractedData.columns.map((column) => (
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
                    const fieldId = `${String(row._id)}:${column}`;
                    const isCellHighlighted = hoveredOverlayId === fieldId;
                    const safeId = fieldId.replace(/:/g, '-');
                    
                    const isEditing = editingCellId === fieldId;
                    const displayValue = localEdits[fieldId] !== undefined ? localEdits[fieldId] : String(row[column] || "");

                    return (
                      <td
                        key={column}
                        id={`cell-${safeId}`}
                        className={`p-2 break-words whitespace-normal hover:bg-warning/10 cursor-pointer text-base-content text-[13px] transition-colors ${
                          isCellHighlighted && !isEditing ? "bg-primary text-primary-content font-bold rounded shadow-inner" : ""
                        }`}
                        onMouseEnter={() =>
                          onHover(fieldId)
                        }
                        onMouseLeave={() => onHover(null)}
                        onClick={() => {
                          if (!isEditing) {
                            handleCellClick(fieldId, displayValue);
                          }
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            className="input input-xs input-bordered w-full max-w-xs bg-base-100 text-base-content"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => handleCellBlur(fieldId)}
                            onKeyDown={(e) => handleCellKeyDown(e, fieldId)}
                            autoFocus
                          />
                        ) : (
                          displayValue
                        )}
                      </td>
                    );
                  })}

                  {/* NEW: Confidence score cell added at the end of each row */}
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      {tier.isLow && (
                        <span title="please check this output">
                          <AlertTriangle className="w-3 h-3 text-error cursor-pointer flex-shrink-0" />
                        </span>
                      )}
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
