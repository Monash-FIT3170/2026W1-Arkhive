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
  Info,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import type {
  ExtractedData,
  ExtractedField,
  ExtractedText,
  TableTab,
} from '../../../../models/TableData';
import { getConfidenceTier } from '../../../../utils/confidenceTier';
import { canIndentIndex, isDerivedColumn } from '../../../../utils/indentEditor';
import { parseFieldId } from '../../../../utils/tableOperations';
import ExtractedFieldsSection from './ExtractedFieldsSection';
import type { ValidationFileGroup } from '../../../../utils/fileGrouping';
import { ExportModal } from './ExportModal';
import TextInputModal from '../modals/TextInputModal';
import Toast from '../modals/Toast';

function ExtractedDataPanel({
  onHover,
  extractedData,
  fileGroups,
  currentGlobalIndex,
  hoveredOverlayIds,
  onCellEdit,
  onRowAdd,
  onRowDelete,
  onRowIndent,
  onRowOutdent,
  onColumnAdd,
  onColumnDelete,
  onColumnRename,
  onRowMove,
  onColumnReorder,
  onIndentColumnChange,
  isEditMode,
  onEditModeChange,
  editedCells,
  onUndoLast,
  tables,
  activeTableId,
  onSelectTable,
  fields,
  texts,
  editedBlockIds,
  onBlockEdit,
  onBlockHover,
}: {
  // Props omitted for brevity, keeping identical to original signature
  onHover: (id: string | null) => void;
  extractedData: ExtractedData;
  fileGroups?: ValidationFileGroup[];
  currentGlobalIndex?: number;
  hoveredOverlayIds?: string[];
  onCellEdit?: (fieldId: string, newValue: string) => void;
  onRowAdd?: () => void;
  onRowDelete?: (rowId: string | number) => void;
  onRowIndent?: (rowId: string | number) => void;
  onRowOutdent?: (rowId: string | number) => void;
  onColumnAdd?: (columnName: string) => void;
  onColumnDelete?: (columnName: string) => void;
  onColumnRename?: (oldName: string, newName: string) => void;
  onRowMove?: (rowId: string | number, direction: 'up' | 'down') => void;
  onColumnReorder?: (newColumns: string[]) => void;
  onIndentColumnChange?: (column: string) => void;
  isEditMode?: boolean;
  onEditModeChange?: (value: boolean) => void;
  editedCells?: Set<string>;
  onUndoLast?: () => void;
  tables?: TableTab[];
  activeTableId?: string;
  onSelectTable?: (tableId: string) => void;
  fields?: ExtractedField[];
  texts?: ExtractedText[];
  editedBlockIds?: Set<string>;
  onBlockEdit?: (blockId: string, newValue: string) => void;
  onBlockHover?: (blockId: string | null) => void;
}) {
  const [isMouseInside, setIsMouseInside] = useState(false);

  // NEW: Track whether we are viewing the table or the extracted fields
  const [activeView, setActiveView] = useState<'fields' | 'table'>('table');

  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [isConfidenceCollapsed, setIsConfidenceCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('arkhive.confidenceColumnCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleConfidenceCollapsed = () => {
    setIsConfidenceCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('arkhive.confidenceColumnCollapsed', String(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };
  const [editValue, setEditValue] = useState<string>('');
  const [initialEditValue, setInitialEditValue] = useState<string>('');
  const [localEdits, setLocalEdits] = useState<Record<string, string>>({});
  const [showSuccessMessage, setShowSuccessMessage] = useState<boolean>(false);
  const [showDiscardMessage, setShowDiscardMessage] = useState<boolean>(false);
  const [showAddColumnModal, setShowAddColumnModal] = useState(false);
  const [renamingColumn, setRenamingColumn] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportedFormat, setExportedFormat] = useState<boolean>(false);
  const [columnDeleteToast, setColumnDeleteToast] = useState<string | null>(null);
  const [columnRenameToast, setColumnRenameToast] = useState<{
    oldName: string;
    newName: string;
  } | null>(null);
  const [rowDeleteToast, setRowDeleteToast] = useState(false);

  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  useEffect(() => {
    if (hoveredOverlayIds && hoveredOverlayIds.length > 0 && !isMouseInside) {
      const safeId = hoveredOverlayIds[0].replace(/:/g, '-');
      const el = document.getElementById(`cell-${safeId}`);
      if (el && typeof el.scrollIntoView === 'function') {
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
      setTimeout(() => setShowSuccessMessage(false), 2000);
    }
    setEditingCellId(null);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent, fieldId: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCellBlur(fieldId);
    } else if (e.key === 'Escape') {
      if (editValue !== initialEditValue) {
        setShowDiscardMessage(true);
        setTimeout(() => setShowDiscardMessage(false), 2000);
      }
      setEditingCellId(null);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleCellBlur(fieldId);
      const { rowId, column } = parseFieldId(fieldId);
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
      if (nextRowIdx >= rows.length) return;

      const nextRow = rows[nextRowIdx];
      const nextColumn = columns[nextColIdx];
      const nextFieldId = `${String(nextRow._id)}:${nextColumn}`;
      const nextValue = String(nextRow[nextColumn] || '');

      setEditingCellId(nextFieldId);
      setEditValue(nextValue);
      setInitialEditValue(nextValue);
    }
  };

  const handleColumnRename = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    if (extractedData.columns.includes(trimmed)) return;

    setLocalEdits((prev) => {
      const next: Record<string, string> = {};
      const oldSuffix = `:${oldName}`;
      const newSuffix = `:${trimmed}`;
      for (const [key, val] of Object.entries(prev)) {
        if (key.endsWith(oldSuffix)) {
          const rowId = key.slice(0, key.length - oldSuffix.length);
          next[`${rowId}${newSuffix}`] = val;
        } else {
          next[key] = val;
        }
      }
      return next;
    });

    onColumnRename?.(oldName, trimmed);
    setRowDeleteToast(false);
    setColumnDeleteToast(null);
    setColumnRenameToast({ oldName, newName: trimmed });
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), 2000);
  };

  const indentColumnOptions = extractedData.columns.filter(
    (c) => !isDerivedColumn(extractedData, c)
  );

  const hasFields = (fields && fields.length > 0) || (texts && texts.length > 0);
  const showTabs = hasFields || (tables && tables.length > 1);

  return (
    <div
      className="h-full w-full rounded-lg border border-base-300 bg-base-200 p-4 text-left shadow-sm flex flex-col"
      onMouseEnter={() => setIsMouseInside(true)}
      onMouseLeave={() => setIsMouseInside(false)}
    >
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-base-content tracking-wide uppercase">
            EXTRACTED DATA
          </h2>
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
          {isEditMode &&
            onColumnAdd &&
            extractedData.columns.length > 0 &&
            activeView === 'table' && (
              <button
                onClick={() => setShowAddColumnModal(true)}
                className="btn btn-sm gap-2 text-xs transition-all rounded-xl btn-outline"
                title="Add Column"
              >
                <Plus className="w-3.5 h-3.5" /> Add Column
              </button>
            )}
          {isEditMode &&
            onIndentColumnChange &&
            indentColumnOptions.length > 1 &&
            activeView === 'table' && (
              <label className="flex items-center gap-1.5 text-xs text-base-content/70">
                Indent by
                <select
                  className="select select-bordered select-xs rounded-lg"
                  value={extractedData.itemColumnKey}
                  onChange={(e) => onIndentColumnChange(e.target.value)}
                >
                  {indentColumnOptions.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
            )}
          <button
            onClick={() => setShowExportModal(true)}
            className={`btn btn-sm gap-2 text-xs transition-all rounded-xl text-base-100 ${
              exportedFormat ? 'btn-success' : 'btn-primary'
            }`}
          >
            {exportedFormat ? (
              <>
                <Check className="w-3.5 h-3.5" /> Exported!
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" /> Export
              </>
            )}
          </button>
        </div>
      </div>

      {/* Unified Tablist */}
      {showTabs && (
        <div
          role="tablist"
          aria-label="Views on this page"
          className="mb-4 flex flex-wrap gap-1 border-b border-base-300 pb-2"
        >
          {hasFields && (
            <button
              role="tab"
              type="button"
              aria-selected={activeView === 'fields'}
              onClick={() => setActiveView('fields')}
              className={`btn btn-sm h-8 min-h-0 gap-1.5 rounded-lg text-xs ${
                activeView === 'fields'
                  ? 'btn-primary text-base-100'
                  : 'btn-ghost text-base-content/70 hover:bg-base-300/50'
              }`}
            >
              Document Details
              <span className="opacity-70 font-normal">
                {(fields?.length || 0) + (texts?.length || 0)} items
              </span>
            </button>
          )}

          {tables && tables.length > 0 ? (
            tables.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={activeView === 'table' && t.id === activeTableId}
                onClick={() => {
                  setActiveView('table');
                  onSelectTable?.(t.id);
                }}
                className={`btn btn-sm h-8 min-h-0 gap-1.5 rounded-lg text-xs ${
                  activeView === 'table' && t.id === activeTableId
                    ? 'btn-primary text-base-100'
                    : 'btn-ghost text-base-content/70 hover:bg-base-300/50'
                }`}
              >
                {t.label}
                <span className="opacity-70 font-normal">
                  {t.rowCount} {t.rowCount === 1 ? 'row' : 'rows'}
                </span>
              </button>
            ))
          ) : (
            <button
              role="tab"
              type="button"
              aria-selected={activeView === 'table'}
              onClick={() => setActiveView('table')}
              className={`btn btn-sm h-8 min-h-0 gap-1.5 rounded-lg text-xs ${
                activeView === 'table'
                  ? 'btn-primary text-base-100'
                  : 'btn-ghost text-base-content/70 hover:bg-base-300/50'
              }`}
            >
              Table Data
            </button>
          )}
        </div>
      )}

      {/* Render Document Details */}
      {activeView === 'fields' && hasFields && (
        <ExtractedFieldsSection
          fields={fields ?? []}
          texts={texts ?? []}
          isEditMode={isEditMode}
          editedIds={editedBlockIds}
          onEdit={onBlockEdit}
          onHover={onBlockHover}
        />
      )}

      {/* Render Table Area */}
      {activeView === 'table' && (
        <>
          <div className="flex-1 overflow-auto min-h-0 max-w-full pb-20">
            {extractedData.columns.length === 0 && (
              <div className="py-8 text-center text-sm text-base-content/60">
                No table was found on this page.
              </div>
            )}
            <table
              className={`table table-fixed w-full border border-base-300 text-[10px] ${
                extractedData.columns.length === 0 ? 'hidden' : ''
              }`}
            >
              {/* --- Table Header & Body Content Remains Exactly As It Was --- */}
              <thead>
                <tr className="text-base-content/70">
                  {extractedData.columns.map((column) => {
                    const derived = isDerivedColumn(extractedData, column);
                    const isIndentColumn = column === extractedData.itemColumnKey;
                    const canRename = isEditMode && !!onColumnRename && !derived;
                    return (
                      <th
                        key={column}
                        className={`p-3 whitespace-normal break-words text-center text-[12px] font-bold border-b border-base-300 align-top transition-colors ${
                          isEditMode && dragOverColumn === column && draggedColumn !== column
                            ? 'bg-primary/20'
                            : ''
                        }`}
                        style={{ height: '1px' }}
                        draggable={isEditMode && !derived}
                        onDragStart={() => {
                          if (!isEditMode || derived) return;
                          setDraggedColumn(column);
                        }}
                        onDragOver={(e) => {
                          if (!isEditMode || derived) return;
                          e.preventDefault();
                          setDragOverColumn(column);
                        }}
                        onDragLeave={() => setDragOverColumn(null)}
                        onDrop={() => {
                          if (
                            !isEditMode ||
                            derived ||
                            !draggedColumn ||
                            draggedColumn === column ||
                            isDerivedColumn(extractedData, draggedColumn)
                          )
                            return;
                          const cols = [...extractedData.columns];
                          cols.splice(cols.indexOf(draggedColumn), 1);
                          cols.splice(cols.indexOf(column), 0, draggedColumn);
                          onColumnReorder?.(cols);
                          setDraggedColumn(null);
                          setDragOverColumn(null);
                        }}
                      >
                        <div className="flex flex-col items-center justify-between h-full gap-2">
                          {isEditMode && !derived && (
                            <div className="cursor-grab text-base-content/40 hover:text-base-content/80 w-full flex justify-center">
                              ⠿
                            </div>
                          )}
                          <span
                            className={`text-left w-full flex-grow ${canRename ? 'cursor-pointer hover:underline' : ''}`}
                            title={canRename ? 'Click to rename column' : undefined}
                            onClick={(e) => {
                              if (canRename) {
                                e.stopPropagation();
                                setRenamingColumn(column);
                              }
                            }}
                          >
                            {column.replace(/_/g, ' ')}
                          </span>
                          {isIndentColumn && (
                            <span
                              className="badge badge-primary badge-outline badge-xs text-[9px]"
                              title="Rows are indented from this column"
                            >
                              indent
                            </span>
                          )}
                          {isEditMode && !derived && (onColumnRename || onColumnDelete) && (
                            <div className="flex items-center justify-center gap-1 w-full bg-base-300/30 rounded px-1 py-0.5">
                              {onColumnRename && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs btn-square min-h-0 h-5 w-5 text-base-content/70 opacity-60 hover:opacity-100 hover:bg-base-content/10"
                                  title="Rename Column"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingColumn(column);
                                  }}
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                              {onColumnDelete && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs btn-square min-h-0 h-5 w-5 text-error opacity-60 hover:opacity-100 hover:bg-error/20"
                                  title="Delete Column"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onColumnDelete(column);
                                    setRowDeleteToast(false);
                                    setColumnRenameToast(null);
                                    setColumnDeleteToast(column);
                                  }}
                                >
                                  <Trash className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  {!isEditMode &&
                    (isConfidenceCollapsed ? (
                      <th
                        className="p-1.5 text-center border-b border-base-300 border-l-2 border-base-300 bg-base-200/60 w-[42px] select-none align-middle cursor-pointer hover:bg-base-300/50 transition-colors"
                        onClick={toggleConfidenceCollapsed}
                      >
                        <div className="flex flex-col items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleConfidenceCollapsed();
                            }}
                            className="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0 text-base-content/60 hover:text-base-content rounded-md"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[9px] font-bold text-base-content/50 uppercase tracking-tighter">
                            %
                          </span>
                        </div>
                      </th>
                    ) : (
                      <th className="p-2.5 text-left border-b border-base-300 border-l-2 border-base-300 bg-base-200/60 whitespace-normal break-words w-[135px] select-none align-top">
                        <div className="flex flex-col h-full justify-between gap-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="badge badge-neutral badge-xs text-[9px] font-semibold tracking-wider uppercase opacity-75 px-1.5 py-0.5">
                              AI Metric
                            </span>
                            <div className="flex items-center gap-0.5">
                              <span
                                className="tooltip tooltip-left cursor-help"
                                data-tip="Confidence score is an AI extraction metric and is not part of the exported table data."
                              >
                                <Info className="w-3.5 h-3.5 text-base-content/40 hover:text-base-content transition-colors" />
                              </span>
                              <button
                                type="button"
                                onClick={toggleConfidenceCollapsed}
                                className="btn btn-ghost btn-xs btn-square h-5 w-5 min-h-0 text-base-content/50 hover:text-base-content hover:bg-base-300/60 rounded-md transition-colors"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <span className="text-[11px] font-bold text-base-content/80 tracking-wide uppercase">
                            CONFIDENCE
                          </span>
                        </div>
                      </th>
                    ))}
                  {isEditMode && (onRowDelete || onRowMove) && (
                    <th className="p-3 border-b border-base-300 w-24"></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {extractedData.rows.map((row, rowIndex) => {
                  const tier = getConfidenceTier(row._confidence ?? 1);
                  return (
                    <tr
                      key={row._id}
                      className={`border-b border-base-300 hover:bg-base-300/40 ${tier.isLow ? 'bg-error/10' : ''}`}
                    >
                      {extractedData.columns.map((column) => {
                        const fieldId = `${String(row._id)}:${column}`;
                        const isCellHighlighted = hoveredOverlayIds
                          ? hoveredOverlayIds.includes(fieldId)
                          : false;
                        const safeId = fieldId.replace(/:/g, '-');
                        const derived = isDerivedColumn(extractedData, column);
                        const isEditing = editingCellId === fieldId;
                        const displayValue =
                          !onCellEdit && localEdits[fieldId] !== undefined
                            ? localEdits[fieldId]
                            : String(row[column] || '');

                        return (
                          <td
                            key={column}
                            id={`cell-${safeId}`}
                            className={`p-2 break-words whitespace-normal hover:bg-warning/10 text-base-content text-[13px] transition-colors ${isEditMode ? 'cursor-pointer' : ''} ${
                              isCellHighlighted && !isEditing
                                ? 'bg-primary/20 text-base-content font-semibold rounded'
                                : editedCells?.has(fieldId)
                                  ? 'bg-warning/15'
                                  : derived
                                    ? 'bg-base-300/20'
                                    : ''
                            }`}
                            onMouseEnter={() => onHover(fieldId)}
                            onMouseLeave={() => onHover(null)}
                            onClick={() => {
                              if (!isEditing) handleCellClick(fieldId, displayValue);
                            }}
                          >
                            {isEditing ? (
                              <textarea
                                className="w-full bg-base-100 text-base-content text-[13px] leading-snug p-1.5 rounded border border-primary ring-2 ring-primary/20 outline-none resize-none overflow-hidden shadow-sm transition-all"
                                rows={1}
                                value={editValue}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => {
                                  setEditValue(e.target.value);
                                  const el = e.target as HTMLTextAreaElement;
                                  el.style.height = 'auto';
                                  el.style.height = `${el.scrollHeight}px`;
                                }}
                                onBlur={() => handleCellBlur(fieldId)}
                                onKeyDown={(e) => handleCellKeyDown(e, fieldId)}
                                autoFocus
                                ref={(el) => {
                                  if (el) {
                                    el.style.height = 'auto';
                                    el.style.height = `${el.scrollHeight}px`;
                                  }
                                }}
                              />
                            ) : (
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
                      {!isEditMode &&
                        (isConfidenceCollapsed ? (
                          <td
                            className={`p-1.5 border-l-2 border-base-300 text-center ${tier.isLow ? 'bg-error/15' : 'bg-base-200/40'}`}
                            title={tier.label}
                          >
                            <div className="flex items-center justify-center">
                              {tier.isLow ? (
                                <AlertTriangle className="w-3.5 h-3.5 text-error flex-shrink-0" />
                              ) : (
                                <span
                                  className={`inline-block w-2.5 h-2.5 rounded-full ${tier.badgeClass === 'badge-success' ? 'bg-success' : tier.badgeClass === 'badge-warning' ? 'bg-warning' : 'bg-error'}`}
                                />
                              )}
                            </div>
                          </td>
                        ) : (
                          <td
                            className={`p-2 border-l-2 border-base-300 ${tier.isLow ? 'bg-error/15' : 'bg-base-200/40'}`}
                          >
                            <div className="flex items-center gap-1">
                              {tier.isLow && (
                                <AlertTriangle className="w-3 h-3 text-error cursor-pointer flex-shrink-0" />
                              )}
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${tier.badgeClass === 'badge-success' ? 'border-success text-success bg-[var(--color-base-100)]' : tier.badgeClass === 'badge-warning' ? 'border-warning text-warning bg-[var(--color-base-100)]' : 'border-error text-error bg-[var(--color-base-100)]'}`}
                              >
                                {tier.label}
                              </span>
                            </div>
                          </td>
                        ))}
                      {isEditMode && (onRowDelete || onRowMove || onRowIndent || onRowOutdent) && (
                        <td className="p-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {tier.isLow && (
                              <AlertTriangle className="w-3.5 h-3.5 text-error flex-shrink-0 mr-1" />
                            )}
                            {(onRowIndent || onRowOutdent) && (
                              <div className="flex flex-col">
                                <button
                                  className="btn btn-ghost btn-[0.5rem] min-h-0 h-4 px-1 text-base-content opacity-50 hover:opacity-100"
                                  disabled={!canIndentIndex(extractedData.rows, rowIndex)}
                                  onClick={() => onRowIndent?.(row._id)}
                                >
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                                <button
                                  className="btn btn-ghost btn-[0.5rem] min-h-0 h-4 px-1 text-base-content opacity-50 hover:opacity-100"
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
                                  onClick={() => onRowMove(row._id, 'up')}
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  className="btn btn-ghost btn-[0.5rem] min-h-0 h-4 px-1 text-base-content opacity-50 hover:opacity-100"
                                  onClick={() => onRowMove(row._id, 'down')}
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            {onRowDelete && (
                              <button
                                className="btn btn-ghost btn-xs btn-square text-error opacity-50 hover:opacity-100"
                                onClick={() => {
                                  onRowDelete(row._id);
                                  setColumnDeleteToast(null);
                                  setRowDeleteToast(true);
                                }}
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
          {isEditMode && onRowAdd && extractedData.columns.length > 0 && (
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
        </>
      )}

      {/* --- Modals and Toasts (unchanged) --- */}
      <TextInputModal
        open={showAddColumnModal}
        title="Add New Column"
        description="Enter a name for the new column."
        placeholder="Column name"
        confirmLabel="Add Column"
        validate={(name) => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          if (extractedData.columns.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
            return 'A column with this name already exists';
          }
          return null;
        }}
        onConfirm={(name) => {
          onColumnAdd?.(name);
          setShowAddColumnModal(false);
        }}
        onCancel={() => setShowAddColumnModal(false)}
      />

      <TextInputModal
        key={renamingColumn ?? 'none'}
        open={renamingColumn !== null}
        title="Rename Column"
        description={
          renamingColumn
            ? `Enter a new name for column "${renamingColumn.replace(/_/g, ' ')}".`
            : 'Enter a new column name.'
        }
        placeholder="Column name"
        initialValue={renamingColumn ?? ''}
        confirmLabel="Rename Column"
        validate={(name) => {
          const trimmed = name.trim();
          if (!trimmed) return null;
          if (
            renamingColumn &&
            trimmed.toLowerCase() !== renamingColumn.toLowerCase() &&
            extractedData.columns.some((c) => c.toLowerCase() === trimmed.toLowerCase())
          ) {
            return 'A column with this name already exists';
          }
          return null;
        }}
        onConfirm={(newName) => {
          if (renamingColumn) handleColumnRename(renamingColumn, newName);
          setRenamingColumn(null);
        }}
        onCancel={() => setRenamingColumn(null)}
      />

      <Toast
        open={rowDeleteToast}
        message="Row deleted"
        actionLabel="Undo"
        onAction={onUndoLast}
        onDismiss={() => setRowDeleteToast(false)}
      />
      <Toast
        open={columnDeleteToast !== null}
        message={
          columnDeleteToast ? `Column "${columnDeleteToast.replace(/_/g, ' ')}" deleted` : ''
        }
        actionLabel="Undo"
        onAction={onUndoLast}
        onDismiss={() => setColumnDeleteToast(null)}
      />
      <Toast
        open={columnRenameToast !== null}
        message={
          columnRenameToast
            ? `Column renamed to "${columnRenameToast.newName.replace(/_/g, ' ')}"`
            : ''
        }
        actionLabel="Undo"
        onAction={onUndoLast}
        onDismiss={() => setColumnRenameToast(null)}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        extractedData={extractedData}
        fileGroups={fileGroups}
        currentGlobalIndex={currentGlobalIndex}
        onExport={() => {
          setExportedFormat(true);
          setTimeout(() => setExportedFormat(false), 2500);
        }}
      />
    </div>
  );
}

export default ExtractedDataPanel;
