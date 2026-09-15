import { useState } from 'react';
import type { ExtractedData } from '../../../../models/TableData';
import { exportExtractedDataAsCSV } from '../../../../services/csvDownloadService';
import { exportExtractedDataAsJSON } from '../../../../services/jsonDownloadService';
import { exportExtractedDataAsTXT } from '../../../../services/txtDownloadService';
import { exportExtractedDataAsXLSX } from '../../../../services/xlsxDownloadService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  extractedData: ExtractedData;
  allExtractedData?: ExtractedData[];
  onExport?: () => void;
}

export function ExportModal({ isOpen, onClose, extractedData, allExtractedData, onExport }: ExportModalProps) {
  const [exportScope, setExportScope] = useState<'current' | 'all'>('current');
  const [selectedTemplates, setSelectedTemplates] = useState({
    csv_default: true,
    csv_future: false,
    json_default: false,
    txt_default: false,
    xlsx_default: false
  });

  if (!isOpen) return null;

  const handleExtract = () => {
    // Current export services only support current page data for non-CSV formats.
    const csvData = exportScope === 'all' && allExtractedData ? allExtractedData : extractedData;

    if (selectedTemplates.csv_default) exportExtractedDataAsCSV(csvData);
    if (selectedTemplates.csv_future) { /* future logic */ }
    if (selectedTemplates.txt_default) exportExtractedDataAsTXT(extractedData);
    if (selectedTemplates.xlsx_default) exportExtractedDataAsXLSX(extractedData);
    if (selectedTemplates.json_default) exportExtractedDataAsJSON(extractedData);

    if (onExport) onExport();
    onClose();
  };

  return (
    <div className="modal modal-open z-[100]">
      <div className="modal-box max-w-3xl">
        <h3 className="font-bold text-xl mb-6">Export Data</h3>

        {/* Scope selection */}
        <div className="flex gap-2 mb-6">
          <button
            className={`btn btn-sm ${exportScope === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setExportScope('all')}
          >
            All Pages
          </button>
          <button
            className={`btn btn-sm ${exportScope === 'current' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setExportScope('current')}
          >
            Current Page
          </button>
        </div>

        {/* Format selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* CSV */}
          <div className="border border-base-300 p-4 rounded-xl">
            <h4 className="text-lg uppercase font-bold mb-3">CSV</h4>
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer flex items-center gap-3">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={selectedTemplates.csv_default}
                  onChange={(e) => setSelectedTemplates(prev => ({ ...prev, csv_default: e.target.checked }))}
                />
                <span className="label-text">Default template</span>
              </label>
              <label className="cursor-pointer flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={selectedTemplates.csv_future}
                  onChange={(e) => setSelectedTemplates(prev => ({ ...prev, csv_future: e.target.checked }))}
                />
                <span className="label-text">Future template (Example)</span>
              </label>
            </div>
          </div>

          {/* JSON */}
          <div className="border border-base-300 p-4 rounded-xl">
            <h4 className="text-lg uppercase font-bold mb-3">JSON</h4>
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer flex items-center gap-3">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={selectedTemplates.json_default}
                  onChange={(e) => setSelectedTemplates(prev => ({ ...prev, json_default: e.target.checked }))}
                />
                <span className="label-text">Default template</span>
              </label>
            </div>
          </div>

          {/* TXT */}
          <div className="border border-base-300 p-4 rounded-xl">
            <h4 className="text-lg uppercase font-bold mb-3">TXT</h4>
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer flex items-center gap-3">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={selectedTemplates.txt_default}
                  onChange={(e) => setSelectedTemplates(prev => ({ ...prev, txt_default: e.target.checked }))}
                />
                <span className="label-text">Default template</span>
              </label>
            </div>
          </div>

          {/* XLSX */}
          <div className="border border-base-300 p-4 rounded-xl">
            <h4 className="text-lg uppercase font-bold mb-3">XLSX</h4>
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer flex items-center gap-3">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  checked={selectedTemplates.xlsx_default}
                  onChange={(e) => setSelectedTemplates(prev => ({ ...prev, xlsx_default: e.target.checked }))}
                />
                <span className="label-text">Default template</span>
              </label>
            </div>
          </div>
        </div>

        <div className="modal-action">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary px-8"
            disabled={!Object.values(selectedTemplates).some(Boolean)}
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
