import { useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  CheckCircle2,
  AlertCircle,
  Layers,
  Sparkles
} from 'lucide-react';
import type { DocumentJob } from '../../../../models/Job';
import {
  exportBatchAsXLSX,
  exportBatchAsCSV,
  exportBatchAsJSON,
  exportBatchAsTXT
} from '../../../../services/batchExportService';

interface BatchDocumentSelectorProps {
  jobs: DocumentJob[];
  activeJobIndex: number;
  onSelectJob: (index: number) => void;
}

export default function BatchDocumentSelector({
  jobs,
  activeJobIndex,
  onSelectJob
}: BatchDocumentSelectorProps) {
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll active tab into view
  useEffect(() => {
    if (activeTabRef.current && typeof activeTabRef.current.scrollIntoView === 'function') {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [activeJobIndex]);

  if (!jobs || jobs.length === 0) return null;

  const totalJobs = jobs.length;
  const completedCount = jobs.filter((j) => j.status === 'completed').length;
  const failedCount = jobs.filter((j) => j.status === 'failed').length;

  const validConfidences = jobs
    .map((j) => j.confidence)
    .filter((c): c is number => typeof c === 'number' && c > 0);
  const avgConfidence =
    validConfidences.length > 0
      ? Math.round((validConfidences.reduce((a, b) => a + b, 0) / validConfidences.length) * 100)
      : 0;

  const handlePrev = () => {
    if (activeJobIndex > 0) {
      onSelectJob(activeJobIndex - 1);
    }
  };

  const handleNext = () => {
    if (activeJobIndex < totalJobs - 1) {
      onSelectJob(activeJobIndex + 1);
    }
  };

  const handleBatchExport = (format: 'xlsx' | 'csv' | 'json' | 'txt') => {
    if (format === 'xlsx') {
      exportBatchAsXLSX(jobs);
    } else if (format === 'csv') {
      exportBatchAsCSV(jobs);
    } else if (format === 'json') {
      exportBatchAsJSON(jobs);
    } else if (format === 'txt') {
      exportBatchAsTXT(jobs);
    }
    (document.activeElement as HTMLElement)?.blur();
  };

  return (
    <div className="w-full bg-base-200 border-b border-base-300 px-4 py-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Batch Header & Summary */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-lg text-xs font-bold">
            <Layers className="w-4 h-4" />
            <span>Batch ({totalJobs} {totalJobs === 1 ? 'Doc' : 'Docs'})</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-base-content/70">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              {completedCount} ready
            </span>
            {failedCount > 0 && (
              <span className="flex items-center gap-1 text-error">
                <AlertCircle className="w-3.5 h-3.5" />
                {failedCount} failed
              </span>
            )}
            {avgConfidence > 0 && (
              <span className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-base-100 border border-base-300">
                <Sparkles className="w-3 h-3 text-warning" />
                Avg Confidence: {avgConfidence}%
              </span>
            )}
          </div>
        </div>

        {/* Navigation & Batch Export Actions */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Previous / Next buttons */}
          <div className="join">
            <button
              onClick={handlePrev}
              disabled={activeJobIndex === 0}
              className="btn btn-xs join-item btn-outline"
              title="Previous Document"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Prev</span>
            </button>
            <span className="join-item px-2.5 flex items-center text-xs font-medium bg-base-100 border-y border-base-300">
              {activeJobIndex + 1} of {totalJobs}
            </span>
            <button
              onClick={handleNext}
              disabled={activeJobIndex >= totalJobs - 1}
              className="btn btn-xs join-item btn-outline"
              title="Next Document"
            >
              <span className="hidden md:inline">Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Batch Export Dropdown */}
          <div className="dropdown dropdown-end">
            <button
              tabIndex={0}
              className="btn btn-xs btn-primary gap-1.5 font-medium rounded-lg"
              title="Export All Documents in Batch"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Batch</span>
            </button>
            <ul
              tabIndex={0}
              className="dropdown-content menu bg-base-100 rounded-box z-30 w-52 p-2 shadow-lg border border-base-300 text-xs mt-1"
            >
              <li className="menu-title text-[11px] uppercase tracking-wider text-base-content/50 px-2 py-1">
                Batch Export All ({totalJobs} docs)
              </li>
              <li>
                <a onClick={() => handleBatchExport('xlsx')}>
                  <span className="font-semibold text-success">Excel Workbook (.xlsx)</span>
                  <span className="text-[10px] text-base-content/50 block">Multi-sheet workbook</span>
                </a>
              </li>
              <li>
                <a onClick={() => handleBatchExport('csv')}>
                  <span className="font-semibold">Combined CSV (.csv)</span>
                </a>
              </li>
              <li>
                <a onClick={() => handleBatchExport('json')}>
                  <span className="font-semibold">Structured JSON (.json)</span>
                </a>
              </li>
              <li>
                <a onClick={() => handleBatchExport('txt')}>
                  <span className="font-semibold">Plain Text Summary (.txt)</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Document Tabs */}
      <div
        ref={tabsScrollRef}
        className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin"
      >
        {jobs.map((job, index) => {
          const isActive = index === activeJobIndex;
          const confPercent = Math.round((job.confidence || 0) * 100);
          const isFailed = job.status === 'failed';

          return (
            <button
              key={job.id || `doc-tab-${index}`}
              ref={isActive ? activeTabRef : undefined}
              onClick={() => onSelectJob(index)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 border text-left cursor-pointer ${
                isActive
                  ? 'bg-base-100 border-primary shadow-sm text-base-content ring-1 ring-primary'
                  : 'bg-base-100/60 hover:bg-base-100 border-base-300 text-base-content/70'
              }`}
              title={`${job.fileName} (${job.documentType})`}
            >
              <div className="flex items-center justify-center w-5 h-5 rounded bg-base-200 text-[11px] font-bold text-base-content/80">
                {index + 1}
              </div>

              <div className="flex flex-col max-w-[130px] sm:max-w-[180px]">
                <span className="truncate font-semibold text-[11px]">
                  {job.fileName || `Document ${index + 1}`}
                </span>
                <span className="text-[10px] text-base-content/50">
                  {job.documentType || 'Document'}
                </span>
              </div>

              {/* Status / Confidence Badge */}
              {isFailed ? (
                <span className="badge badge-error badge-xs font-bold text-[9px] px-1 py-0.5">
                  Error
                </span>
              ) : confPercent > 0 ? (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold border ${
                    confPercent >= 85
                      ? 'border-success text-success bg-success/10'
                      : confPercent >= 70
                      ? 'border-warning text-warning bg-warning/10'
                      : 'border-error text-error bg-error/10'
                  }`}
                >
                  {confPercent}%
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
