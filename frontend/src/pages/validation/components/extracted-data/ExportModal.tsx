import { useState, useMemo } from 'react';
import type { ExtractedData } from '../../../../models/TableData';
import type { ValidationFileGroup } from '../../../../utils/fileGrouping';
import { exportExtractedDataAsCSV, exportExtractedDataAsSimpleCSV } from '../../../../services/csvDownloadService';
import { exportExtractedDataAsJSON } from '../../../../services/jsonDownloadService';
import { exportExtractedDataAsTXT } from '../../../../services/txtDownloadService';
import { exportExtractedDataAsXLSX } from '../../../../services/xlsxDownloadService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractedData: ExtractedData;
  allExtractedData?: ExtractedData[];
  fileGroups?: ValidationFileGroup[];
  currentGlobalIndex?: number;
  onExport?: () => void;
}

function mergeExtractedData(pages: ExtractedData[]): ExtractedData {
  if (pages.length === 0) return { columns: [], rows: [], itemColumnKey: '' };
  return {
    columns: pages[0].columns,
    itemColumnKey: pages[0].itemColumnKey,
    rows: pages.flatMap(p => p.rows),
  };
}

export function ExportModal({ isOpen, onClose, extractedData, fileGroups, currentGlobalIndex, onExport }: ExportModalProps) {
  const [customFilename, setCustomFilename] = useState('arkhive-extracted-data');
  const [mergeStrategy, setMergeStrategy] = useState<'single' | 'per-file' | 'per-page'>('single');
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set(currentGlobalIndex !== undefined ? [currentGlobalIndex] : []));
  
  const [selectedTemplates, setSelectedTemplates] = useState({
    csv_default: true,
    csv_simple: false,
    json_default: false,
    txt_default: false,
    xlsx_default: false
  });

  if (!isOpen) return null;

  const isValidFilename = (name: string) => !/[\\/:*?"<>|]/.test(name) && name.trim().length > 0;
  const isFilenameValid = isValidFilename(customFilename);

  const togglePageSelection = (globalIndex: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(globalIndex)) next.delete(globalIndex);
      else next.add(globalIndex);
      return next;
    });
  };

  const toggleFileSelection = (fileGroup: ValidationFileGroup) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      const allSelected = fileGroup.pages.every(p => next.has(p.globalIndex));
      if (allSelected) {
        fileGroup.pages.forEach(p => next.delete(p.globalIndex));
      } else {
        fileGroup.pages.forEach(p => next.add(p.globalIndex));
      }
      return next;
    });
  };

  const selectAllPages = () => {
    if (!fileGroups) return;
    const allGlobalIndices = fileGroups.flatMap(g => g.pages.map(p => p.globalIndex));
    if (selectedPages.size === allGlobalIndices.length) {
      setSelectedPages(new Set()); // deselect all
    } else {
      setSelectedPages(new Set(allGlobalIndices));
    }
  };

  const handleExtract = () => {
    if (!fileGroups) {
      // Fallback
      if (selectedPages.has(currentGlobalIndex ?? 0)) {
        const base = customFilename.trim() || 'arkhive-extracted-data';
        if (selectedTemplates.csv_default) exportExtractedDataAsCSV(extractedData, `${base}_default.csv`);
        if (selectedTemplates.csv_simple) exportExtractedDataAsSimpleCSV(extractedData, `${base}_simple.csv`);
        if (selectedTemplates.txt_default) exportExtractedDataAsTXT(extractedData, `${base}_default.txt`);
        if (selectedTemplates.xlsx_default) exportExtractedDataAsXLSX(extractedData, `${base}_default.xlsx`);
        if (selectedTemplates.json_default) exportExtractedDataAsJSON(extractedData, `${base}_default.json`);
      }
      if (onExport) onExport();
      onClose();
      return;
    }

    const baseFilename = customFilename.trim() || 'arkhive-extracted-data';

    const performExport = (data: ExtractedData, suffix: string) => {
      if (selectedTemplates.csv_default) exportExtractedDataAsCSV(data, `${baseFilename}${suffix}_default.csv`);
      if (selectedTemplates.csv_simple) exportExtractedDataAsSimpleCSV(data, `${baseFilename}${suffix}_simple.csv`);
      if (selectedTemplates.txt_default) exportExtractedDataAsTXT(data, `${baseFilename}${suffix}_default.txt`);
      if (selectedTemplates.xlsx_default) exportExtractedDataAsXLSX(data, `${baseFilename}${suffix}_default.xlsx`);
      if (selectedTemplates.json_default) exportExtractedDataAsJSON(data, `${baseFilename}${suffix}_default.json`);
    };

    if (mergeStrategy === 'single') {
      const allSelectedPages = fileGroups
        .flatMap(g => g.pages)
        .filter(p => selectedPages.has(p.globalIndex))
        .map(p => p.extractedPage);
      if (allSelectedPages.length > 0) {
        performExport(mergeExtractedData(allSelectedPages), '');
      }
    } else if (mergeStrategy === 'per-file') {
      fileGroups.forEach((group, idx) => {
        const groupPages = group.pages
          .filter(p => selectedPages.has(p.globalIndex))
          .map(p => p.extractedPage);
        if (groupPages.length > 0) {
          const suffix = fileGroups.length > 1 ? `_doc${idx + 1}` : '';
          performExport(mergeExtractedData(groupPages), suffix);
        }
      });
    } else if (mergeStrategy === 'per-page') {
      fileGroups.forEach((group, gIdx) => {
        group.pages.forEach((page, pIdx) => {
          if (selectedPages.has(page.globalIndex)) {
            const suffix = `_doc${gIdx + 1}_page${pIdx + 1}`;
            performExport(page.extractedPage, suffix);
          }
        });
      });
    }

    if (onExport) onExport();
    onClose();
  };

  const allGlobalIndicesLength = fileGroups?.flatMap(g => g.pages).length || 0;
  const isAllSelected = allGlobalIndicesLength > 0 && selectedPages.size === allGlobalIndicesLength;

  const templatesCount = Object.values(selectedTemplates).filter(Boolean).length;
  const numGroupsSelected = fileGroups?.filter(g => g.pages.some(p => selectedPages.has(p.globalIndex))).length || 0;
  const numPagesSelected = selectedPages.size;

  const countForSingle = templatesCount * 1;
  const countForPerFile = templatesCount * numGroupsSelected;
  const countForPerPage = templatesCount * numPagesSelected;

  return (
    <div className="modal modal-open z-[100] bg-base-300/80 backdrop-blur-sm">
      <div className="modal-box max-w-6xl p-6 bg-base-100 shadow-2xl rounded-2xl flex flex-col max-h-[95vh] h-[800px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-shrink-0">
          <div>
            <h3 className="font-extrabold text-2xl text-base-content">Export Data</h3>
            <p className="text-base-content/60 text-xs mt-0.5">Select your desired formats and customize the output.</p>
          </div>
          <button className="btn btn-ghost btn-circle btn-sm bg-base-200 hover:bg-base-300 transition-colors" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Two Column Layout */}
        <div className="flex flex-col md:flex-row gap-8 overflow-hidden flex-1">
          
          {/* LEFT COLUMN: Filename & Templates */}
          <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-2 pb-2">
            
            {/* Filename Input */}
            <div className="bg-base-200/50 p-4 rounded-xl border border-base-200 flex-shrink-0">
              <label className="label px-0 pt-0 pb-1">
                <span className="label-text font-bold text-base-content/80 text-xs uppercase tracking-wider">Export Filename</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  className={`input input-bordered input-sm w-full font-medium shadow-sm transition-colors ${!isFilenameValid ? 'input-error bg-error/5' : 'focus:border-primary'}`}
                  value={customFilename}
                  onChange={(e) => setCustomFilename(e.target.value)}
                  placeholder="arkhive-extracted-data"
                />
                {!isFilenameValid && (
                  <span className="text-[10px] text-error font-medium absolute -bottom-4 left-0">
                    Invalid characters: \ / : * ? &quot; &lt; &gt; |
                  </span>
                )}
              </div>
            </div>

            {/* Formats List - Horizontal Rows */}
            <div className="flex flex-col gap-4">
              
              {/* CSV Row */}
              <div className="bg-base-200/30 p-4 rounded-xl border border-base-200 flex flex-row items-center gap-6">
                <div className="flex flex-col items-center gap-2 opacity-80 min-w-[60px]">
                  <img src="/export_images/csv.png" alt="CSV" className="w-8 h-8 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                  <span className="text-xs font-bold uppercase tracking-widest">CSV</span>
                </div>
                <div className="w-px h-16 bg-base-300"></div>
                <div className="flex gap-3 overflow-x-auto flex-1 pb-1">
                  <TemplateCard
                    title="Default Template"
                    imageSrc="/export_images/sample1.png"
                    selected={selectedTemplates.csv_default}
                    onClick={() => setSelectedTemplates(prev => ({ ...prev, csv_default: !prev.csv_default }))}
                  />
                  <TemplateCard
                    title="Simple Template"
                    imageSrc="/export_images/sample2.png"
                    selected={selectedTemplates.csv_simple}
                    onClick={() => setSelectedTemplates(prev => ({ ...prev, csv_simple: !prev.csv_simple }))}
                  />
                </div>
              </div>

              {/* JSON Row */}
              <div className="bg-base-200/30 p-4 rounded-xl border border-base-200 flex flex-row items-center gap-6">
                <div className="flex flex-col items-center gap-2 opacity-80 min-w-[60px]">
                  <img src="/export_images/json.png" alt="JSON" className="w-8 h-8 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                  <span className="text-xs font-bold uppercase tracking-widest">JSON</span>
                </div>
                <div className="w-px h-16 bg-base-300"></div>
                <div className="flex gap-3 overflow-x-auto flex-1 pb-1">
                  <TemplateCard
                    title="Default Template"
                    imageSrc="/export_images/sample3.png"
                    selected={selectedTemplates.json_default}
                    onClick={() => setSelectedTemplates(prev => ({ ...prev, json_default: !prev.json_default }))}
                  />
                </div>
              </div>

              {/* TXT Row */}
              <div className="bg-base-200/30 p-4 rounded-xl border border-base-200 flex flex-row items-center gap-6">
                <div className="flex flex-col items-center gap-2 opacity-80 min-w-[60px]">
                  <img src="/export_images/txt.png" alt="TXT" className="w-8 h-8 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                  <span className="text-xs font-bold uppercase tracking-widest">TXT</span>
                </div>
                <div className="w-px h-16 bg-base-300"></div>
                <div className="flex gap-3 overflow-x-auto flex-1 pb-1">
                  <TemplateCard
                    title="Default Template"
                    imageSrc="/export_images/sample1.png"
                    selected={selectedTemplates.txt_default}
                    onClick={() => setSelectedTemplates(prev => ({ ...prev, txt_default: !prev.txt_default }))}
                  />
                </div>
              </div>

              {/* XLSX Row */}
              <div className="bg-base-200/30 p-4 rounded-xl border border-base-200 flex flex-row items-center gap-6">
                <div className="flex flex-col items-center gap-2 opacity-80 min-w-[60px]">
                  <img src="/export_images/xls.png" alt="XLSX" className="w-8 h-8 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                  <span className="text-xs font-bold uppercase tracking-widest">XLSX</span>
                </div>
                <div className="w-px h-16 bg-base-300"></div>
                <div className="flex gap-3 overflow-x-auto flex-1 pb-1">
                  <TemplateCard
                    title="Default Template"
                    imageSrc="/export_images/sample3.png"
                    selected={selectedTemplates.xlsx_default}
                    onClick={() => setSelectedTemplates(prev => ({ ...prev, xlsx_default: !prev.xlsx_default }))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Page Selection & Merge Settings */}
          <div className="w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col gap-4 md:border-l border-base-200 md:pl-6 h-full overflow-hidden">
            <div className="flex items-center justify-between flex-shrink-0">
              <h4 className="font-bold uppercase tracking-widest text-base-content/80 text-sm">Select Pages</h4>
              <button 
                className="text-xs btn btn-xs btn-ghost text-primary font-bold hover:bg-primary/10" 
                onClick={selectAllPages}
              >
                {isAllSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-base-200/30 border border-base-200 rounded-xl p-4 shadow-inner">
              {fileGroups ? fileGroups.map((group) => {
                const allSelected = group.pages.every(p => selectedPages.has(p.globalIndex));
                const someSelected = group.pages.some(p => selectedPages.has(p.globalIndex));
                return (
                  <div key={group.fileId} className="mb-4 last:mb-0">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-sm text-base-content hover:text-primary transition-colors">
                      <input 
                        type="checkbox" 
                        className="checkbox checkbox-sm checkbox-primary rounded-md" 
                        checked={allSelected} 
                        ref={input => { if (input) input.indeterminate = !allSelected && someSelected; }}
                        onChange={() => toggleFileSelection(group)} 
                      />
                      <span className="truncate">{group.fileName}</span>
                    </label>
                    <div className="ml-6 flex flex-col gap-2 mt-3">
                      {group.pages.map(page => (
                        <label key={page.globalIndex} className="flex items-center gap-2 cursor-pointer text-xs text-base-content/80 hover:text-base-content transition-colors">
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
              }) : (
                <div className="text-center text-xs opacity-50 mt-10">No files available</div>
              )}
            </div>

            {/* Output Structure */}
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex-shrink-0 shadow-sm">
              <h4 className="font-bold uppercase tracking-widest text-primary/80 text-[10px] mb-3">Output Structure</h4>
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 cursor-pointer text-sm font-semibold text-base-content hover:text-primary transition-colors">
                  <input type="radio" name="mergeStrategy" className="radio radio-sm radio-primary mt-0.5" checked={mergeStrategy === 'single'} onChange={() => setMergeStrategy('single')} />
                  <div className="flex flex-col gap-0.5">
                    <span>Merge into a single file</span>
                    <span className="text-xs font-normal opacity-70">Combines into {countForSingle} file{countForSingle !== 1 ? 's' : ''}.</span>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer text-sm font-semibold text-base-content hover:text-primary transition-colors">
                  <input type="radio" name="mergeStrategy" className="radio radio-sm radio-primary mt-0.5" checked={mergeStrategy === 'per-file'} onChange={() => setMergeStrategy('per-file')} />
                  <div className="flex flex-col gap-0.5">
                    <span>Export per document</span>
                    <span className="text-xs font-normal opacity-70">Creates {countForPerFile} separate file{countForPerFile !== 1 ? 's' : ''}.</span>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer text-sm font-semibold text-base-content hover:text-primary transition-colors">
                  <input type="radio" name="mergeStrategy" className="radio radio-sm radio-primary mt-0.5" checked={mergeStrategy === 'per-page'} onChange={() => setMergeStrategy('per-page')} />
                  <div className="flex flex-col gap-0.5">
                    <span>Export per page</span>
                    <span className="text-xs font-normal opacity-70">Creates {countForPerPage} separate file{countForPerPage !== 1 ? 's' : ''}.</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="modal-action mt-6 pt-4 border-t border-base-200 flex justify-end gap-3 flex-shrink-0">
          <button className="btn btn-ghost font-semibold px-6 hover:bg-base-200" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary font-bold px-8 shadow-lg shadow-primary/30"
            disabled={
              !Object.values(selectedTemplates).some(Boolean) || 
              !isFilenameValid ||
              selectedPages.size === 0
            }
            onClick={handleExtract}
          >
            Download
          </button>
        </div>
      </div>
      <div className="modal-backdrop bg-base-300/50" onClick={onClose}></div>
    </div>
  );
}

// Internal component for the template cards to keep code DRY
function TemplateCard({ title, imageSrc, selected, onClick }: { title: string, imageSrc: string, selected: boolean, onClick: () => void }) {
  return (
    <div
      className={`relative cursor-pointer rounded-xl border-2 overflow-hidden transition-all duration-200 w-32 flex-shrink-0 flex flex-col ${
        selected 
          ? 'border-primary ring-2 ring-primary/20 bg-primary/10 shadow-md' 
          : 'border-base-300 hover:border-primary/50 hover:bg-base-200/50 shadow-sm'
      }`}
      onClick={onClick}
    >
      <div className="w-full aspect-square bg-base-100 flex items-center justify-center overflow-hidden">
        <img src={imageSrc} alt={title} className="w-full h-full object-cover transition-transform duration-300 hover:scale-105" onError={(e) => e.currentTarget.style.display = 'none'} />
      </div>
      <div className="p-2 border-t border-base-200 bg-base-100 flex items-center justify-between gap-1 flex-1">
        <span className="font-semibold text-[10px] leading-tight text-base-content truncate" title={title}>{title}</span>
        <div className={`w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center border transition-all ${
          selected ? 'bg-primary border-primary text-primary-content' : 'border-base-300 bg-base-200 text-transparent'
        }`}>
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
      </div>
    </div>
  );
}
