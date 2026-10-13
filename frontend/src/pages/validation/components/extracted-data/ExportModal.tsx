import { useEffect, useMemo, useState } from 'react';
import type { ExtractedData, ExtractedPage } from '../../../../models/TableData';
import type { ValidationFileGroup } from '../../../../utils/fileGrouping';
import { DEFAULT_INCLUDE, type ExportInclude } from '../../../../services/export/model';
import {
  FORMATS,
  TEMPLATES,
  getTemplate,
  templatesByFormat,
  type ExportFormat,
  type ExportTemplate,
} from '../../../../services/export/templates';
import {
  deliver,
  planExport,
  renderPlan,
  type MergeStrategy,
  type PlannerFileGroup,
} from '../../../../services/export/planner';
import { applyFieldMapping, type DocumentType } from '../../../../utils/fieldMapping';
import { FIELD_MAPPING_PRESETS } from '../../../../utils/fieldMappingPresets';
import { recommendTemplate } from '../../../../services/export/recommendation';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The active page. Only used when `fileGroups` isn't provided. */
  extractedData: ExtractedData & Partial<ExtractedPage>;
  fileGroups?: ValidationFileGroup[];
  currentGlobalIndex?: number;
  docType?: string;
  onExport?: () => void;
}

const STRATEGIES: { id: MergeStrategy; title: string; description: string }[] = [
  {
    id: 'single',
    title: 'Merge into a single file',
    description: 'All data combined into one file.',
  },
  { id: 'per-file', title: 'Export per document', description: 'One file per source document.' },
  { id: 'per-page', title: 'Export per page', description: 'One file for every single page.' },
];

const computeInitialSelection = (current?: number, groups?: ValidationFileGroup[]) => {
  if (groups && groups.flatMap((g) => g.pages).length > 1) {
    return new Set<number>(groups.flatMap((g) => g.pages.map((p) => p.globalIndex)));
  }
  return new Set<number>(current !== undefined ? [current] : [0]);
};

export function ExportModal({
  isOpen,
  onClose,
  extractedData,
  fileGroups,
  currentGlobalIndex,
  docType,
  onExport,
}: ExportModalProps) {
  const [customFilename, setCustomFilename] = useState('export');
  const [customFileNames, setCustomFileNames] = useState<Record<string, string>>({});
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState<MergeStrategy>('single');
  const [scopeMode, setScopeMode] = useState<'current' | 'all' | 'custom'>(() =>
    fileGroups && fileGroups.flatMap((g) => g.pages).length > 1 ? 'all' : 'current'
  );

  const [selectedPages, setSelectedPages] = useState<Set<number>>(() =>
    computeInitialSelection(currentGlobalIndex, fileGroups)
  );
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(() => {
    const rec = recommendTemplate({ docType, extractedData, fileGroups });
    const recId = rec.getRecommendedIdForFormat('csv');
    return new Set<string>([recId || 'csv.default']);
  });
  const [include, setInclude] = useState<ExportInclude>(DEFAULT_INCLUDE);
  const [exportError, setExportError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Compute recommendation based on classification and extracted data heuristics
  const recommendation = useMemo(
    () => recommendTemplate({ docType, extractedData, fileGroups }),
    [docType, extractedData, fileGroups]
  );

  // Re-seed selection and recommend best template on modal open
  useEffect(() => {
    if (isOpen) {
      setExportError(null);
      setShowConfirmModal(false);

      // Pre-select recommended template
      const recId = recommendation.getRecommendedIdForFormat('csv');
      if (recId) {
        setSelectedTemplateIds(new Set([recId]));
      }

      // Default scope: if multi-page fileGroups exist, select all, otherwise current page
      const allIndices = fileGroups?.flatMap((g) => g.pages.map((p) => p.globalIndex)) || [];
      if (allIndices.length > 1) {
        setScopeMode('all');
        setSelectedPages(new Set(allIndices));
      } else {
        setScopeMode('current');
        setSelectedPages(new Set(currentGlobalIndex !== undefined ? [currentGlobalIndex] : [0]));
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  const successToast = successMessage ? (
    <div className="toast toast-top toast-center z-[10000]">
      <div className="alert alert-success" role="status">
        <span>{successMessage}</span>
      </div>
    </div>
  ) : null;

  if (!isOpen) return successToast;

  // Without file groups, fall back to the active page as a one-page "file".
  const groups: PlannerFileGroup[] = fileGroups ?? [
    {
      fileId: 'current',
      fileName: 'export',
      pages: [
        {
          globalIndex: currentGlobalIndex ?? 0,
          pageIndexInFile: 0,
          extractedPage: { pageIndex: 0, ...extractedData },
        },
      ],
    },
  ];

  const allPagesList = groups.flatMap((g) => g.pages);
  const allGlobalIndices = allPagesList.map((p) => p.globalIndex);

  const isValidFilename = (name: string) => !/[\\/:*?"<>|]/.test(name) && name.trim().length > 0;
  const isFilenameValid = isValidFilename(customFilename);
  const baseName = customFilename.trim() || 'export';
  const templateIds = [...selectedTemplateIds];
  const activeTemplate =
    TEMPLATES.find((t) => selectedTemplateIds.has(t.id)) || TEMPLATES[0];

  const togglePageSelection = (globalIndex: number) => {
    setScopeMode('custom');
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(globalIndex)) next.delete(globalIndex);
      else next.add(globalIndex);
      return next;
    });
  };

  const toggleFileSelection = (fileGroup: ValidationFileGroup) => {
    setScopeMode('custom');
    setSelectedPages((prev) => {
      const next = new Set(prev);
      const allSelected = fileGroup.pages.every((p) => next.has(p.globalIndex));
      fileGroup.pages.forEach((p) =>
        allSelected ? next.delete(p.globalIndex) : next.add(p.globalIndex)
      );
      return next;
    });
  };

  const handleScopeChange = (mode: 'current' | 'all' | 'custom') => {
    setScopeMode(mode);
    if (mode === 'current') {
      setSelectedPages(new Set(currentGlobalIndex !== undefined ? [currentGlobalIndex] : [0]));
    } else if (mode === 'all') {
      setSelectedPages(new Set(allGlobalIndices));
    }
  };

  const selectTemplate = (id: string) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const planFor = (strategy: MergeStrategy) =>
    planExport({
      fileGroups: groups,
      selectedPages,
      strategy,
      templateIds,
      baseName,
      fileNames: customFileNames,
    });

  const counts: Record<MergeStrategy, number> = {
    single: planFor('single').length,
    'per-file': planFor('per-file').length,
    'per-page': planFor('per-page').length,
  };
  const currentCount = counts[mergeStrategy];

  const isBulkExport = selectedPages.size > 5 || currentCount > 5;

  const handleExtract = () => {
    setExportError(null);
    try {
      // Automate column mapping based on the selected templates (e.g. invoice or receipt)
      const autoMappingType: DocumentType | null =
        templateIds.some((id) => id.includes('invoice')) ? 'invoice' :
        templateIds.some((id) => id.includes('receipt')) ? 'receipt' :
        templateIds.some((id) => id.includes('form') || id.includes('tax_return')) ? 'form' : null;

      const mapping = autoMappingType ? FIELD_MAPPING_PRESETS[autoMappingType] : null;
      let exportGroups = groups;
      if (mapping && mapping.rules.length > 0) {
        exportGroups = groups.map((g) => ({
          ...g,
          pages: g.pages.map((p) => {
            const mapped = applyFieldMapping(p.extractedPage, mapping);
            const otherTables = p.extractedPage.otherTables?.map((t) => ({
              ...applyFieldMapping(t, mapping),
              tableId: t.tableId,
            }));
            return {
              ...p,
              extractedPage: { ...mapped, otherTables },
            };
          }),
        }));
      }

      const plan = planFor(mergeStrategy);
      const plannedWithMappedGroups = mapping && mapping.rules.length > 0
        ? planExport({
            fileGroups: exportGroups,
            selectedPages,
            strategy: mergeStrategy,
            templateIds,
            baseName,
            fileNames: customFileNames,
          })
        : plan;

      const formats = Array.from(new Set(plan.map((p) => p.template.format.toLowerCase())));
      const formatSuffix = formats.join('-');
      const defaultBulkZipName = `bulk-export-${formatSuffix || 'data'}.zip`;
      const zipName = isBulkExport
        ? (baseName === 'export' ? defaultBulkZipName : `${baseName}-bulk-export.zip`)
        : `${baseName}.zip`;

      deliver(renderPlan(plannedWithMappedGroups, { include }), zipName);

      const fileCount = plan.length;
      if (fileCount > 0) {
        const formatNames = Array.from(new Set(plan.map((p) => p.template.format.toUpperCase())));
        setSuccessMessage(
          fileCount === 1
            ? `${formatNames[0]} file downloaded successfully`
            : `${fileCount} files downloaded (${formatNames.join(', ')})`
        );
      }
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : 'Could not generate the download.'
      );
      return;
    }
    onExport?.();
    onClose();
  };

  const handleDownloadClick = () => {
    if (isBulkExport) setShowConfirmModal(true);
    else handleExtract();
  };

  return (
    <div className="modal modal-open z-[100] bg-base-300/80 backdrop-blur-sm">
      <div className="modal-box max-w-6xl p-6 bg-base-100 shadow-2xl rounded-2xl flex flex-col max-h-[95vh] h-[820px]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-base-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="font-extrabold text-2xl text-base-content tracking-tight">Export Data</h3>
              <p className="text-base-content/60 text-xs mt-0.5">
                Select your template and configure output options.
              </p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Detected: {recommendation.category === 'default' ? 'Table' : recommendation.category.charAt(0).toUpperCase() + recommendation.category.slice(1)}
            </span>
          </div>
          <button
            className="btn btn-ghost btn-circle btn-sm bg-base-200 hover:bg-base-300 transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {exportError && <div className="alert alert-error text-sm my-3 py-2">{exportError}</div>}

        {/* Consolidated Two-Pane Body */}
        <div className="flex flex-col md:flex-row gap-6 overflow-hidden flex-1 pt-4">
          {/* LEFT PANE: Filename input at top + Formats list with horizontal template rows per format */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-2 pb-2 min-w-0">
            {/* Filename Input */}
            <div className="bg-base-200/40 p-3.5 rounded-xl border border-base-200 flex-shrink-0">
              <label className="label px-0 pt-0 pb-1">
                <span className="label-text font-bold text-base-content/80 text-xs uppercase tracking-wider">
                  Export Filename
                </span>
              </label>
              <div className="flex flex-col">
                <input
                  type="text"
                  className={`input input-bordered input-sm w-full font-medium shadow-sm transition-colors ${
                    !isFilenameValid ? 'input-error bg-error/5' : 'focus:border-primary'
                  }`}
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                  placeholder="export"
                />
                {!isFilenameValid && (
                  <span className="text-[10px] text-error font-medium mt-1">
                    Invalid characters: \ / : * ? &quot; &lt; &gt; |
                  </span>
                )}
              </div>
            </div>

            {/* Formats List - ONE Horizontal Scroller that scrolls all format sections together */}
            <div className="overflow-x-auto pb-2 scrollbar-thin">
              <div className="flex flex-col gap-3 min-w-max">
                {FORMATS.map((format) => (
                  <div
                    key={format.id}
                    className="bg-base-200/30 p-2.5 rounded-xl border border-base-200 flex flex-row items-center gap-3.5"
                  >
                    {/* Format Icon & Label (Sticky to stay visible on horizontal scroll) */}
                    <div className="sticky left-0 z-10 bg-base-100/95 backdrop-blur-sm shadow-xs px-2.5 py-1.5 rounded-lg border border-base-200 flex items-center gap-3 flex-shrink-0">
                      <div className="flex flex-col items-center gap-1.5 opacity-80 min-w-[46px] flex-shrink-0">
                        <img
                          src={format.iconSrc}
                          alt={format.label}
                          className="w-6 h-6 object-contain"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-base-content/80">
                          {format.label}
                        </span>
                      </div>
                      <div className="w-px h-12 bg-base-300 flex-shrink-0"></div>
                    </div>

                    {/* Template cards for this format - scroll along with the parent */}
                    <div className="flex gap-2.5 flex-shrink-0">
                      {templatesByFormat(format.id).map((t) => {
                        const isSelected = selectedTemplateIds.has(t.id);
                        const isRecommended = recommendation.recommendedTemplateIds.has(t.id);
                        return (
                          <TemplateCard
                            key={t.id}
                            title={t.label}
                            tooltip={t.description}
                            imageSrc={t.previewSrc}
                            selected={isSelected}
                            isRecommended={isRecommended}
                            onClick={() => selectTemplate(t.id)}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT PANE: Consolidated Export Settings */}
          <div className="w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col gap-4 md:border-l border-base-200 md:pl-6 overflow-y-auto pr-1">
            {/* Scope / Pages Selection */}
            <div className="bg-base-200/40 p-3.5 rounded-xl border border-base-200 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="label-text font-bold text-base-content/80 text-[11px] uppercase tracking-wider">
                  Export Scope
                </span>
                <span className="text-[11px] font-bold text-primary">
                  {selectedPages.size} of {allGlobalIndices.length} page{allGlobalIndices.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Quick scope buttons */}
              <div className="grid grid-cols-3 gap-1.5 mb-2.5">
                <button
                  type="button"
                  className={`btn btn-xs rounded-lg font-semibold transition-all ${
                    scopeMode === 'current' ? 'btn-primary text-white' : 'btn-ghost bg-base-100 hover:bg-base-200'
                  }`}
                  onClick={() => handleScopeChange('current')}
                >
                  Current
                </button>
                <button
                  type="button"
                  className={`btn btn-xs rounded-lg font-semibold transition-all ${
                    scopeMode === 'all' ? 'btn-primary text-white' : 'btn-ghost bg-base-100 hover:bg-base-200'
                  }`}
                  onClick={() => handleScopeChange('all')}
                >
                  All ({allGlobalIndices.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-xs rounded-lg font-semibold transition-all ${
                    scopeMode === 'custom' ? 'btn-primary text-white' : 'btn-ghost bg-base-100 hover:bg-base-200'
                  }`}
                  onClick={() => handleScopeChange('custom')}
                >
                  Custom
                </button>
              </div>

              {/* Expandable page selection tree */}
              {scopeMode === 'custom' && (
                <div className="mt-2 max-h-40 overflow-y-auto bg-base-100/70 p-2.5 rounded-lg border border-base-200 text-xs">
                  {groups.map((group) => {
                    const allSelected = group.pages.every((p) => selectedPages.has(p.globalIndex));
                    const someSelected = group.pages.some((p) => selectedPages.has(p.globalIndex));
                    return (
                      <div key={group.fileId} className="mb-2.5 last:mb-0">
                        <label className="flex items-center gap-2 font-bold text-xs text-base-content hover:text-primary transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-xs checkbox-primary rounded"
                            checked={allSelected}
                            ref={(input) => {
                              if (input) input.indeterminate = !allSelected && someSelected;
                            }}
                            onChange={() => toggleFileSelection(group as any)}
                          />
                          {editingFileId === group.fileId ? (
                            <input
                              type="text"
                              className="input input-xs input-primary w-full max-w-xs font-normal"
                              autoFocus
                              defaultValue={customFileNames[group.fileId] || group.fileName}
                              onBlur={(e) => {
                                setCustomFileNames((prev) => ({
                                  ...prev,
                                  [group.fileId]: e.target.value || group.fileName,
                                }));
                                setEditingFileId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                              }}
                            />
                          ) : (
                            <span
                              className="truncate hover:underline cursor-text"
                              onClick={(e) => {
                                e.preventDefault();
                                setEditingFileId(group.fileId);
                              }}
                              title="Click to rename"
                            >
                              {customFileNames[group.fileId] || group.fileName}
                            </span>
                          )}
                        </label>
                        <div className="ml-5 flex flex-col gap-1 mt-1">
                          {group.pages.map((page) => (
                            <label
                              key={page.globalIndex}
                              className="flex items-center gap-1.5 cursor-pointer text-[11px] text-base-content/80 hover:text-base-content"
                            >
                              <input
                                type="checkbox"
                                className="checkbox checkbox-xs rounded"
                                checked={selectedPages.has(page.globalIndex)}
                                onChange={() => togglePageSelection(page.globalIndex)}
                              />
                              Page {page.pageIndexInFile + 1}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Output Structure */}
            <div className="bg-base-200/40 p-3.5 rounded-xl border border-base-200 flex-shrink-0">
              <span className="label-text font-bold text-base-content/80 text-[11px] uppercase tracking-wider mb-2 block">
                Output Structure
              </span>
              <div className="flex flex-col gap-2">
                {STRATEGIES.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-start gap-2.5 cursor-pointer text-xs font-semibold text-base-content hover:text-primary transition-colors"
                  >
                    <input
                      type="radio"
                      name="mergeStrategy"
                      className="radio radio-xs radio-primary mt-0.5"
                      checked={mergeStrategy === s.id}
                      onChange={() => setMergeStrategy(s.id)}
                    />
                    <div className="flex flex-col flex-1">
                      <span className="flex items-center justify-between">
                        <span>{s.title}</span>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                          {counts[s.id]} file{counts[s.id] !== 1 ? 's' : ''}
                        </span>
                      </span>
                      <span className="text-[10px] font-normal opacity-60 leading-tight mt-0.5">
                        {s.description}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Include Options */}
            <div className="bg-base-200/40 p-3.5 rounded-xl border border-base-200 flex-shrink-0">
              <span className="label-text font-bold text-base-content/80 text-[11px] uppercase tracking-wider mb-2 block">
                Include Content
              </span>
              <div className="flex flex-col gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs checkbox-primary rounded"
                    checked={include.tables === 'all'}
                    onChange={(e) =>
                      setInclude((p) => ({ ...p, tables: e.target.checked ? 'all' : 'active' }))
                    }
                  />
                  <span>All tables on page</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs checkbox-primary rounded"
                    checked={include.fields}
                    onChange={(e) => setInclude((p) => ({ ...p, fields: e.target.checked }))}
                  />
                  <span>Document fields (invoice #, totals…)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs checkbox-primary rounded"
                    checked={include.texts}
                    onChange={(e) => setInclude((p) => ({ ...p, texts: e.target.checked }))}
                  />
                  <span>Text blocks (headers, notes)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="modal-action mt-4 pt-3 border-t border-base-200 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="text-xs text-base-content/70">
            {currentCount > 0 ? (
              <span>
                Exporting <strong className="text-base-content font-bold">{currentCount} file{currentCount !== 1 ? 's' : ''}</strong> ({selectedPages.size} page{selectedPages.size !== 1 ? 's' : ''})
                {isBulkExport ? ' · Bundled as Bulk .zip' : ''}
              </span>
            ) : (
              <span className="text-warning">Select at least one page and template</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost btn-sm font-semibold px-4 hover:bg-base-200" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary btn-sm font-bold px-6 shadow-md shadow-primary/20 text-white"
              disabled={selectedTemplateIds.size === 0 || !isFilenameValid || currentCount === 0}
              onClick={handleDownloadClick}
            >
              Download ({currentCount})
            </button>
          </div>
        </div>
      </div>
      <div className="modal-backdrop bg-base-300/50" onClick={onClose}></div>

      {/* Confirmation Modal for Bulk Downloads */}
      {showConfirmModal && (
        <div className="modal modal-open modal-bottom sm:modal-middle z-[9999]">
          <div className="modal-box bg-base-100 shadow-2xl rounded-3xl p-6 md:p-8 max-w-sm border border-base-200">
            <h3 className="font-extrabold text-xl text-base-content mb-3 flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Bulk Export Download
            </h3>
            <p className="text-sm text-base-content/80 mb-6 leading-relaxed">
              You are about to export{' '}
              <strong className="text-base-content font-bold">{currentCount} files</strong> across{' '}
              <strong className="text-base-content font-bold">{selectedPages.size} pages</strong>.
              They will be bundled into a bulk export archive.
            </p>
            <div className="modal-action mt-2">
              <button
                className="btn btn-ghost font-semibold hover:bg-base-200"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary font-bold shadow-lg shadow-primary/30 text-white"
                onClick={() => {
                  setShowConfirmModal(false);
                  handleExtract();
                }}
              >
                Yes, download zip
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop bg-base-300/80 backdrop-blur-[2px]"
            onClick={() => setShowConfirmModal(false)}
          >
            <button className="cursor-default">close</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  title: string;
  formatLabel?: string;
  tooltip?: string;
  imageSrc: string;
  selected: boolean;
  isRecommended: boolean;
  onClick: () => void;
}

function TemplateCard({
  title,
  formatLabel,
  tooltip,
  imageSrc,
  selected,
  isRecommended,
  onClick,
}: TemplateCardProps) {
  return (
    <div
      title={tooltip}
      className={`relative cursor-pointer rounded-xl border-2 overflow-hidden transition-all duration-200 w-36 flex-shrink-0 flex flex-col group select-none ${
        selected
          ? 'border-primary ring-2 ring-primary/20 bg-primary/10 shadow-md'
          : isRecommended
            ? 'border-emerald-500/80 ring-2 ring-emerald-500/25 bg-emerald-50/15 dark:bg-emerald-950/20 shadow-sm hover:border-emerald-500'
            : 'border-base-300 hover:border-primary/50 hover:bg-base-200/50 shadow-sm'
      }`}
      onClick={onClick}
    >
      {/* Format Badge */}
      {formatLabel && (
        <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-base-100/90 backdrop-blur-sm border border-base-300 text-base-content/80 shadow-xs">
          {formatLabel}
        </div>
      )}

      {/* Recommended Green Badge */}
      {isRecommended && (
        <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-extrabold bg-emerald-500 text-white shadow-sm tracking-wide">
          <svg className="w-2 h-2" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          Recommended
        </div>
      )}

      {/* Thumbnail */}
      <div className="w-full aspect-video bg-base-100 flex items-center justify-center overflow-hidden">
        <img
          src={imageSrc}
          alt={title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      </div>

      {/* Body details */}
      <div className="p-1.5 border-t border-base-200 bg-base-100 flex items-center justify-between gap-1 flex-1">
        <span
          className="font-semibold text-[10px] leading-tight text-base-content truncate"
          title={title}
        >
          {title}
        </span>
        <div
          className={`w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center border transition-all ${
            selected
              ? 'bg-primary border-primary text-primary-content'
              : 'border-base-300 bg-base-200 text-transparent'
          }`}
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
