import {
  AlertTriangle,
  Download,
  Check,
  X,
  Plus,
  Trash,
  Edit2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'; // NEW: Importing icons for confidence badges and export button
import { useState, useEffect } from 'react';
import type { ExtractedData } from '../../../../models/TableData';
import { exportExtractedDataAsCSV } from '../../../../services/csvDownloadService';
import { exportExtractedDataAsJSON } from '../../../../services/jsonDownloadService';
import { exportExtractedDataAsTXT } from '../../../../services/txtDownloadService'; // NEW: TXT export service
import { exportExtractedDataAsXLSX } from '../../../../services/xlsxDownloadService'; // NEW: Excel export service (US-4.5)

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
      colour: '#22c55e',
      label: `${percent}% - High`,
      isLow: false,
      badgeClass: 'badge-success',
    };
  } else if (confidence >= 0.7) {
    return {
      colour: '#f59e0b',
      label: `${percent}% - Medium`,
      isLow: false,
      badgeClass: 'badge-warning',
    };
  } else {
    return {
      colour: '#f59e0b',
      label: `${percent}% - Low`,
      isLow: true, // triggers row highlight and warning icon
      badgeClass: 'badge-error',
    };
  }
}

function ExtractedDataPanel({
  onHover,
  extractedData,
  hoveredOverlayIds,
  onCellEdit,
  onRowAdd,
  onRowDelete,
  onRowIndent,
  onRowOutdent,
  onColumnAdd,
  onColumnDelete,
  onRowMove,
  onColumnReorder,
  isEditMode,
  onEditModeChange,
  editedCells,
}: {
  onHover: (id: string | null) => void;
  extractedData: ExtractedData;
  hoveredOverlayIds?: string[];
  onCellEdit?: (fieldId: string, newValue: string) => void;
  onRowAdd?: () => void;
  onRowDelete?: (rowId: string | number) => void;
  onRowIndent?: (rowId: string | number) => void;
  onRowOutdent?: (rowId: string | number) => void;
  onColumnAdd?: (columnName: string) => void;
  onColumnDelete?: (columnName: string) => void;
  onRowMove?: (rowId: string | number, direction: 'up' | 'down') => void;
  onColumnReorder?: (newColumns: string[]) => void;
  isEditMode?: boolean;
  onEditModeChange?: (value: boolean) => void;
  editedCells?: Set<string>;
}) {
  // Currency formatting function (unchanged)
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
    }).format(amount);
  };

  // used to check if file exported, and which format was last exported
  // UPDATED: was a plain boolean for CSV only; now tracks which format
  // (csv/txt/xlsx) was exported so a single button/dropdown can serve all three
  const [exportedFormat, setExportedFormat] = useState<null | 'csv' | 'txt' | 'xlsx' | 'json'>(
    null
  );
  const [isMouseInside, setIsMouseInside] = useState(false);

  // Editing state
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [initialEditValue, setInitialEditValue] = useState<string>('');
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [showSuccessMessage, setShowSuccessMessage] = useState<boolean>(false);
  const [showDiscardMessage, setShowDiscardMessage] = useState<boolean>(false);
  // const [isEditMode, setIsEditMode] = useState<boolean>(false);

  // Column re-ordering
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  // function to import csv/txt/xlsx/json download services and trigger the download
  // for whichever format the user picked from the dropdown
  // UPDATED: replaces the old handleExportCSV, now handles all export formats
  function handleExport(format: 'csv' | 'txt' | 'xlsx' | 'json') {
    if (format === 'csv') {
      exportExtractedDataAsCSV(extractedData);
    } else if (format === 'txt') {
      exportExtractedDataAsTXT(extractedData);
    } else if (format === 'xlsx') {
      exportExtractedDataAsXLSX(extractedData);
    } else if (format === 'json') {
      exportExtractedDataAsJSON(extractedData);
    }

    setExportedFormat(format);
    setTimeout(() => setExportedFormat(null), 2500);

    // close the dropdown menu after a selection is made
    (document.activeElement as HTMLElement)?.blur();
  }

  useEffect(() => {
    if (hoveredOverlayIds && hoveredOverlayIds.length > 0 && !isMouseInside) {
      // hoveredOverlayIds are fieldIds (e.g. comp_4:SUB_ITEM_2)
      // scroll to the first one — with a group hover there can be several,
      // but only one scroll target makes sense.
      const safeId = hoveredOverlayIds[0].replace(/:/g, '-');
      const el = document.getElementById(`cell-${safeId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [hoveredOverlayIds, isMouseInside]);

  const handleCellClick = (fieldId: string, initialValue: string) => {
    if (!isEditMode) return;
    setEditingCellId(fieldId);
    setEditValue(initialValue);
    setInitialEditValue(initialValue);
  };

  const handleCellBlur = (fieldId: string) => {
    if (editValue !== initialEditValue) {
      setLocalEdits((prev) => ({
        ...prev,
        [fieldId]: editValue,
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
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleCellBlur(fieldId);

      const [rowId, column] = fieldId.split(':');
      const columns = extractedData.columns;
      const rows = extractedData.rows;
      const colIdx = columns.indexOf(column);
      const rowIdx = rows.findIndex((r) => String(r._id) === rowId);

      let nextColIdx = colIdx + 1;
      let nextRowIdx = rowIdx;

      if (nextColIdx >= columns.length) {
        nextColIdx = 0;
        nextRowIdx = rowIdx + 1;
      }

      if (nextRowIdx >= rows.length) {
        return;
      }

      const nextRow = rows[nextRowIdx];
      const nextColumn = columns[nextColIdx];
      const nextFieldId = `${String(nextRow._id)}:${nextColumn}`;
      const nextValue = String(nextRow[nextColumn] || '');

      setEditingCellId(nextFieldId);
      setEditValue(nextValue);
      setInitialEditValue(nextValue);
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onEditModeChange?.(!isEditMode);
              setEditingCellId(null);
            }}
            className={`btn btn-sm gap-2 text-xs transition-all rounded-xl ${isEditMode ? 'btn-warning' : 'btn-outline'}`}
            title="Toggle Edit Mode"
          >
            {isEditMode ? (
              <>
                <Check className="w-3.5 h-3.5" /> Done Editing
              </>
            ) : (
              <>
                <Edit2 className="w-3.5 h-3.5" /> Edit Table
              </>
            )}
          </button>
          {isEditMode && onColumnAdd && (
            <button
              onClick={() => {
                const newColName = prompt('Enter the name of the new column:');
                if (newColName && newColName.trim() !== '') {
                  onColumnAdd(newColName.trim());
                }
              }}
              className="btn btn-sm gap-2 text-xs transition-all rounded-xl btn-outline"
              title="Add Column"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Column
            </button>
          )}
          <div className="dropdown dropdown-end">
            <button
              tabIndex={0}
              className={`btn btn-sm gap-2 text-xs transition-all rounded-xl ${
                exportedFormat ? 'btn-success' : 'btn-primary'
              }`}
            >
              {exportedFormat ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Downloaded!
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Download
                </>
              )}
            </button>
            <ul
              tabIndex={0}
              className="dropdown-content menu bg-base-100 rounded-box z-10 w-45 p-2 shadow-md border border-base-300"
            >
              <li>
                <a onClick={() => handleExport('csv')}>Download as CSV</a>
              </li>
              <li>
                <a onClick={() => handleExport('txt')}>Download as TXT</a>
              </li>
              {/* NEW: Excel export option (US-4.5) */}
              <li>
                <a onClick={() => handleExport('xlsx')}>Download as Excel</a>
              </li>
              <li>
                <a onClick={() => handleExport('json')}>Download as JSON</a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      {/*Acknowledgement: AI (Google Gemini) was used while coding the
            manual corrections*/}
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
                  className={`p-3 whitespace-normal break-words text-center text-[12px] font-bold border-b border-base-300 align-top transition-colors ${
                    isEditMode && dragOverColumn === column && draggedColumn !== column
                      ? 'bg-primary/20'
                      : ''
                  }`}
                  style={{ height: '1px' }}
                  draggable={isEditMode}
                  onDragStart={() => {
                    if (!isEditMode) {
                      return;
                    }
                    setDraggedColumn(column);
                  }}
                  onDragOver={(e) => {
                    if (!isEditMode) {
                      return;
                    }
                    e.preventDefault();
                    setDragOverColumn(column);
                  }}
                  onDragLeave={() => {
                    setDragOverColumn(null);
                  }}
                  onDrop={() => {
                    if (!isEditMode || !draggedColumn || draggedColumn === column) {
                      return;
                    }
                    const cols = [...extractedData.columns];
                    const fromIdx = cols.indexOf(draggedColumn);
                    const toIdx = cols.indexOf(column);
                    cols.splice(fromIdx, 1);
                    cols.splice(toIdx, 0, draggedColumn);
                    onColumnReorder?.(cols);
                    setDraggedColumn(null);
                    setDragOverColumn(null);
                  }}
                >
                  <div className="flex flex-col items-center justify-between h-full gap-2">
                    {/* drag handle icon only shown in edit mode */}
                    {isEditMode && (
                      <div className="cursor-grab text-base-content/40 hover:text-base-content/80 w-full flex justify-center">
                        ⠿
                      </div>
                    )}

                    <span className="text-left w-full flex-grow">{column.replace(/_/g, ' ')}</span>

                    {isEditMode && onColumnDelete && (
                      <div className="flex items-center justify-center gap-1 w-full bg-base-300/30 rounded px-1 py-0.5">
                        {onColumnDelete && (
                          <button
                            className="btn btn-ghost btn-xs btn-square min-h-0 h-5 w-5 text-error opacity-60 hover:opacity-100 hover:bg-error/20"
                            title="Delete Column"
                            onClick={() => onColumnDelete(column)}
                          >
                            <Trash className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </th>
              ))}

              {/* NEW: Confidence column header added at the end of the table */}
              <th className="p-3 text-left text-[12px] font-bold border-b border-base-300 whitespace-normal break-words w-[120px]">
                CONFIDENCE SCORE
              </th>
              {isEditMode && (onRowDelete || onRowMove) && (
                <th className="p-3 border-b border-base-300 w-24"></th>
              )}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {extractedData.rows.map((row) => {
              const tier = getConfidenceTier(row._confidence ?? 1);

              return (
                <tr
                  key={row._id}
                  className={`border-b border-base-300 hover:bg-base-300/40 ${
                    tier.isLow ? 'bg-error/10' : ''
                  }`}
                >
                  {extractedData.columns.map((column) => {
                    const fieldId = `${String(row._id)}:${column}`;
                    const isCellHighlighted = hoveredOverlayIds
                      ? hoveredOverlayIds.includes(fieldId)
                      : false;
                    const safeId = fieldId.replace(/:/g, '-');

                    const isEditing = editingCellId === fieldId;
                    const displayValue =
                      localEdits[fieldId] !== undefined
                        ? localEdits[fieldId]
                        : String(row[column] || '');

                    return (
                      <td
                        key={column}
                        id={`cell-${safeId}`}
                        className={`p-2 break-words whitespace-normal hover:bg-warning/10 text-base-content text-[13px] transition-colors ${
                          isEditMode ? 'cursor-pointer' : ''
                        } ${
                          //yellow tint
                          isCellHighlighted && !isEditing
                            ? 'bg-primary text-primary-content font-bold rounded shadow-inner'
                            : editedCells?.has(fieldId)
                              ? 'bg-warning/15'
                              : ''
                        }`}
                        onMouseEnter={() => onHover(fieldId)}
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
                          //pencil icon
                          <div className="relative">
                            {editedCells?.has(fieldId) && (
                              <Edit2 className="w-2.5 h-2.5 text-warning absolute top-0 right-0 opacity-60" />
                            )}
                            {displayValue}
                          </div>
                        )}
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
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
                          tier.badgeClass === 'badge-success'
                            ? 'border-success text-success bg-white'
                            : tier.badgeClass === 'badge-warning'
                              ? 'border-warning text-warning bg-white'
                              : ' border-error text-error bg-white'
                        }`}
                      >
                        {tier.label}
                      </span>
                    </div>
                  </td>
                  {isEditMode && (onRowDelete || onRowMove || onRowIndent) && (
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(onRowIndent || onRowOutdent) && (
                          <div className="flex flex-col">
                            <button
                              className="btn btn-ghost btn-[0.5rem] min-h-0 h-4 px-1 text-base-content opacity-50 hover:opacity-100"
                              title="Indent (make child of previous row)"
                              disabled={(row._indentLevel ?? 0) === 0 && false /* see note below */}
                              onClick={() => onRowIndent?.(row._id)}
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                            <button
                              className="btn btn-ghost btn-[0.5rem] min-h-0 h-4 px-1 text-base-content opacity-50 hover:opacity-100"
                              title="Outdent"
                              disabled={(row._indentLevel ?? 0) === 0}
                              onClick={() => onRowOutdent?.(row._id)}
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {onRowMove && (
                          <div className="flex flex-col">
                            <button
                              className="btn btn-ghost btn-[0.5rem] min-h-0 h-4 px-1 text-base-content opacity-50 hover:opacity-100"
                              title="Move Row Up"
                              onClick={() => onRowMove(row._id, 'up')}
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              className="btn btn-ghost btn-[0.5rem] min-h-0 h-4 px-1 text-base-content opacity-50 hover:opacity-100"
                              title="Move Row Down"
                              onClick={() => onRowMove(row._id, 'down')}
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        {onRowDelete && (
                          <button
                            className="btn btn-ghost btn-xs btn-square text-error opacity-50 hover:opacity-100"
                            title="Delete Row"
                            onClick={() => onRowDelete(row._id)}
                          >
                            <Trash className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Row Button */}
      {isEditMode && onRowAdd && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={onRowAdd}
            className="btn btn-sm btn-outline gap-2 text-xs transition-all rounded-xl w-full max-w-xs border-dashed"
            title="Add Row"
          >
            <Plus className="w-4 h-4" /> Add Row
          </button>
        </div>
      )}
    </div>
  );
}

export default ExtractedDataPanel;
