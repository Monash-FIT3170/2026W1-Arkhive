import React, { useState, useEffect } from 'react';
import {
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Edit2,
  CheckCircle2,
  Bot,
  Sparkle,
} from 'lucide-react';

// Acknowledgement: Google Gemini was used to help generate this file

export interface OcrIssue {
  fieldId: string;
  fieldName: string;
  ocrValue: string;
  confidenceScore: number;
  issueType?: 'confidence' | 'format';
  rowId: string | number;
  groupId?: string; //  shared by cells that should be resolved together
  formatRegex?: string; // the detected regex for this column, if any
  pageIndex?: number;
}

// The type of slide for review
type ReviewSlide =
  | { kind: 'single'; issue: OcrIssue }
  | { kind: 'group'; groupId: string; fieldName: string; formatRegex?: string; issues: OcrIssue[] };

interface OcrReviewWidgetProps {
  issues: OcrIssue[];
  onAccept: (updates: { fieldId: string; newValue: string }[]) => void;
  onReject: (fieldIds: string[]) => void;
  onManualEdit: (fieldId: string, newValue: string) => void;
  onSlideChange?: (fieldIds: string[], pageIndex?: number) => void; // Optional: Emits when slide changes to highlight field in main document
  onFetchSuggestion?: (fieldId: string) => Promise<string | null>;
  onFetchBulkSuggestion?: (
    column: string,
    fields: { fieldId: string; rowId: string | number; ocrValue: string }[],
    formatRegex?: string
  ) => Promise<Record<string, string> | null>;
  resolvedIds?: Set<string>;
  onResolveIds?: (ids: string[]) => void;
}

// Function that turns each OCR Issue to a equivalent ReviewSlide format
export function buildSlides(issues: OcrIssue[]): ReviewSlide[] {
  const slides: ReviewSlide[] = [];
  const seenGroups = new Set<string>();

  for (const issue of issues) {
    if (issue.groupId) {
      // Group Issues together
      if (seenGroups.has(issue.groupId)) continue;
      seenGroups.add(issue.groupId);
      slides.push({
        kind: 'group',
        groupId: issue.groupId,
        fieldName: issue.fieldName,
        formatRegex: issue.formatRegex,
        issues: issues.filter((i) => i.groupId === issue.groupId),
      });
    } else {
      // Else single
      slides.push({ kind: 'single', issue });
    }
  }
  return slides;
}

export default function OcrReviewWidget({
  issues,
  onAccept,
  onReject,
  onManualEdit,
  onSlideChange,
  onFetchSuggestion,
  onFetchBulkSuggestion,
  resolvedIds,
  onResolveIds,
}: OcrReviewWidgetProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [manualValue, setManualValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const [suggestions, setSuggestions] = useState<Record<string, string | null>>({});
  const [fetchingId, setFetchingId] = useState<string | null>(null);

  // Filter out issues that have already been resolved
  const unresolvedIssues = issues.filter((issue) => !resolvedIds?.has(issue.fieldId));

  // Make review slide per ocr issue
  const slides = buildSlides(unresolvedIssues);
  // Current Slide UI is on
  const currentSlide = slides[currentIndex];

  // Upon render/If dependency change, change slide
  useEffect(() => {
    if (slides.length > 0 && onSlideChange && currentSlide) {
      const fieldIds =
        currentSlide.kind === 'single'
          ? [currentSlide.issue.fieldId]
          : currentSlide.issues.map((i) => i.fieldId);
      const pageIndex =
        currentSlide.kind === 'single'
          ? currentSlide.issue.pageIndex
          : currentSlide.issues[0]?.pageIndex;
      onSlideChange(fieldIds, pageIndex);
    }
  }, [currentIndex, slides.length, onSlideChange, unresolvedIssues]);

  // Whenever the slide list shrinks (or changes) for any reason — resolving an
  // issue, the parent updating `issues`, — make sure currentIndex still
  // points at a real slide instead of relying on markResolved's one-off math.
  useEffect(() => {
    if (slides.length === 0) return;
    if (currentIndex > slides.length - 1) {
      setCurrentIndex(slides.length - 1);
    }
  }, [slides.length, currentIndex]);

  // OCR ISSUE - SINGLE FIELD - ISSUE/SUGGESTION
  const currentSingle = currentSlide?.kind === 'single' ? currentSlide.issue : undefined; // If issue is single -> current issues
  const currentSuggestion = currentSingle ? suggestions[currentSingle.fieldId] : undefined; // If issue is signle -> current suggestion
  const isFetchingCurrent = currentSingle ? fetchingId === currentSingle.fieldId : false; // If issue is signel -> is suggestion being fetched?

  // Trigger a fetch for the current issue
  const handleRequestSuggestion = () => {
    if (!currentSingle || !onFetchSuggestion) return;
    const fieldId = currentSingle.fieldId;
    if (suggestions[fieldId] !== undefined || fetchingId === fieldId) return;

    setFetchingId(fieldId);
    onFetchSuggestion(fieldId)
      .then((val) => {
        setSuggestions((s) => ({ ...s, [fieldId]: val }));
        setFetchingId((current) => (current === fieldId ? null : current));
      })
      .catch(() => setFetchingId((current) => (current === fieldId ? null : current)));
  };

  // BULK OCR ISSUE - CURRENT GROUP - SUGGESTION
  const currentGroup = currentSlide?.kind === 'group' ? currentSlide : undefined; // If group --> current slide
  const isFetchingGroup = currentGroup ? fetchingId === currentGroup.groupId : false; // if group --> is fetching suggestion?
  const groupSuggestionsFetched =
    !!currentGroup && currentGroup.issues.every((i) => suggestions[i.fieldId] !== undefined); // Boolean on whether it has been fetched (only if every issue in group has been fetched)

  const handleRequestBulkSuggestion = () => {
    if (!currentGroup || !onFetchBulkSuggestion) return;
    const { groupId, fieldName, formatRegex, issues: groupIssues } = currentGroup;
    if (fetchingId === groupId) return;

    setFetchingId(groupId);
    onFetchBulkSuggestion(
      fieldName,
      groupIssues.map((i) => ({ fieldId: i.fieldId, rowId: i.rowId, ocrValue: i.ocrValue })),
      formatRegex
    )
      .then((map: Record<string, string> | null) => {
        if (!map) {
          // No suggestions came back at all — treat like a failed fetch so the
          // "Get Suggestions" button reappears
          setFetchingId((current) => (current === groupId ? null : current));
          return;
        }

        setSuggestions((s) => {
          const next = { ...s };
          groupIssues.forEach((i) => {
            // Per-row fallback: if this specific row wasn't in the map, mark it
            // null so the UI falls back to the original OCR value for just that row.
            next[i.fieldId] = map[String(i.rowId)] ?? null;
          });
          return next;
        });
        setFetchingId((current) => (current === groupId ? null : current));
      })
      .catch(() => setFetchingId((current) => (current === groupId ? null : current)));
  };
  const handleNext = () => {
    if (currentIndex < slides.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      resetEditState();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      resetEditState();
    }
  };

  const resetEditState = () => {
    setIsEditing(false);
    setManualValue('');
  };

  const markResolved = (fieldIds: string[]) => {
    onResolveIds?.(fieldIds);
    resetEditState();
  };

  // Handlers matching requirements
  const handleAcceptClick = () => {
    if (!currentSlide) return;

    const updates =
      currentSlide.kind === 'single'
        ? [
            {
              fieldId: currentSlide.issue.fieldId,
              newValue: suggestions[currentSlide.issue.fieldId] || currentSlide.issue.ocrValue,
            },
          ]
        : currentSlide.issues.map((issue) => ({
            fieldId: issue.fieldId,
            newValue: suggestions[issue.fieldId] || issue.ocrValue,
          }));

    onAccept(updates);

    markResolved(updates.map((update) => update.fieldId));
  };

  const handleRejectClick = () => {
    if (!currentSlide) return;

    const fieldIds =
      currentSlide.kind === 'single'
        ? [currentSlide.issue.fieldId]
        : currentSlide.issues.map((issue) => issue.fieldId);

    onReject(fieldIds);

    markResolved(fieldIds);
  };

  const handleManualSubmit = () => {
    if (!currentSingle || !manualValue.trim()) return;
    onManualEdit(currentSingle.fieldId, manualValue.trim());
    markResolved([currentSingle.fieldId]);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-base-200/30 overflow-hidden font-sans min-w-0">
      <div className="p-4 h-full flex flex-col relative min-w-0">
        {unresolvedIssues.length === 0 ? (
          // Success State
          <div className="flex-1 flex flex-col items-center justify-center text-success gap-4 animate-in fade-in zoom-in duration-500">
            <div className="bg-success/20 p-5 rounded-full shadow-inner">
              <CheckCircle2 size={64} className="text-success" />
            </div>
            <div className="text-center">
              <p className="font-bold text-2xl text-base-content">All Clear!</p>
              <p className="text-sm text-base-content/60 mt-2">
                You've resolved all flagged issues.
              </p>
            </div>
          </div>
        ) : (
          // Carousel Interface
          <div className="flex-1 flex flex-col min-h-0 min-w-0 animate-in fade-in duration-300">
            {/* Progress Indicator */}
            <div className="text-xs font-semibold text-base-content/50 mb-6 text-center uppercase tracking-widest">
              Issue {currentIndex + 1} of {slides.length}
            </div>

            {/* Carousel Slide */}
            <div className="flex-1 flex flex-col justify-center items-center text-center space-y-4 transition-all w-full min-w-0 overflow-y-auto p-1">
              <div className="bg-base-100 px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-primary shadow-sm border border-primary/20 shrink-0">
                {currentSlide?.kind === 'single'
                  ? currentSlide.issue.fieldName
                  : currentSlide?.fieldName}
                {currentSlide?.kind === 'group' && (
                  <span className="ml-2 text-base-content/50 normal-case font-medium">
                    · {currentSlide.issues.length} cells
                  </span>
                )}
              </div>

              {currentSlide?.kind === 'single' ? (
                <div className="w-full relative group space-y-4 text-left min-w-0">
                  {/* SLIDE FOR SINGLE ISSUES */}
                  {/* Detected Value */}
                  <div>
                    <p className="text-xs text-base-content/60 font-semibold mb-1 uppercase tracking-wider ml-1 flex justify-between items-center">
                      {currentSlide.issue.issueType === 'format'
                        ? 'Format Inconsistency'
                        : 'Detected Data'}
                      {currentSlide.issue.issueType !== 'format' && (
                        <span className="text-[10px] font-medium text-warning flex items-center gap-1 bg-warning/10 px-2 py-0.5 rounded-full">
                          <AlertCircle size={12} />
                          {(currentSlide.issue.confidenceScore * 100).toFixed(0)}%
                        </span>
                      )}
                    </p>
                    <div className="bg-base-100 relative p-4 rounded-xl w-full border border-base-300 shadow-sm">
                      <p className="text-lg font-medium break-all text-base-content line-through opacity-60">
                        "{currentSlide.issue.ocrValue}"
                      </p>
                    </div>
                  </div>

                  {/* AI Suggestion */}
                  <div>
                    {/* On demand fetch */}
                    <p className="text-xs text-primary/80 font-semibold mb-1 uppercase tracking-wider ml-1 flex items-center gap-1.5">
                      <Bot size={14} /> AI Suggestion
                    </p>

                    {currentSuggestion === undefined && !isFetchingCurrent ? (
                      // Not requested yet
                      <button
                        className="btn btn-outline btn-primary w-full justify-center gap-2 shadow-sm"
                        onClick={handleRequestSuggestion}
                        disabled={!onFetchSuggestion}
                      >
                        <Sparkle size={16} />
                        Get Suggestion
                      </button>
                    ) : (
                      <div className="bg-primary/5 relative p-4 rounded-xl w-full border border-primary/20 shadow-sm">
                        {isFetchingCurrent ? (
                          <div className="flex items-center justify-center gap-2 py-1 text-primary/60">
                            <span className="loading loading-spinner loading-sm"></span>
                            <span className="text-sm font-medium animate-pulse">
                              Analyzing document context...
                            </span>
                          </div>
                        ) : (
                          <p className="text-xl font-bold break-all text-primary-content bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                            "{currentSuggestion || currentSlide.issue.ocrValue}"
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : currentSlide?.kind === 'group' ? (
                <div className="w-full text-left space-y-3 min-w-0">
                  {/* SLIDE FOR GROUP ISSUES */}
                  <p className="text-xs text-base-content/60 font-semibold uppercase tracking-wider ml-1">
                    Format Inconsistency · {currentSlide.issues.length} cells flagged in this column
                  </p>

                  {/* AI Suggestion */}
                  {!groupSuggestionsFetched && !isFetchingGroup ? (
                    <button
                      className="btn btn-outline btn-primary w-full justify-center gap-2 shadow-sm"
                      onClick={handleRequestBulkSuggestion}
                      disabled={!onFetchBulkSuggestion}
                    >
                      <Sparkle size={16} />
                      Get Suggestions for all {currentSlide.issues.length}
                    </button>
                  ) : isFetchingGroup ? (
                    <div className="flex items-center justify-center gap-2 py-3 text-primary/60 bg-primary/5 rounded-xl border border-primary/20">
                      <span className="loading loading-spinner loading-sm"></span>
                      <span className="text-sm font-medium animate-pulse">
                        Analyzing {currentSlide.issues.length} rows...
                      </span>
                    </div>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                      {currentSlide.issues.map((item) => (
                        <div
                          key={item.fieldId}
                          className="bg-base-100 border border-base-300 rounded-lg p-3 flex items-center justify-between gap-3"
                        >
                          <span className="text-sm line-through opacity-60 break-all">
                            "{item.ocrValue}"
                          </span>
                          <span className="text-sm font-bold text-primary break-all">
                            "{suggestions[item.fieldId] || item.ocrValue}"
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Resolution Actions */}
            <div className="mt-auto pt-4 h-14 flex items-center justify-center w-full shrink-0">
              {isEditing && currentSlide?.kind === 'single' ? (
                <div className="flex gap-2 w-full animate-in slide-in-from-bottom-2 duration-200">
                  <input
                    type="text"
                    className="input input-bordered flex-1 bg-base-100 focus:bg-base-100 transition-colors shadow-inner"
                    placeholder="Type correct value..."
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleManualSubmit();
                      if (e.key === 'Escape') resetEditState();
                    }}
                  />
                  <button className="btn btn-primary shadow-md" onClick={handleManualSubmit}>
                    Save
                  </button>
                  <button className="btn btn-ghost" onClick={resetEditState}>
                    Cancel
                  </button>
                </div>
              ) : currentSlide?.kind === 'group' ? (
                <div className="flex justify-center gap-4 w-full">
                  <button
                    className="btn btn-success text-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all gap-2"
                    onClick={handleAcceptClick}
                    disabled={isFetchingGroup}
                  >
                    <Check size={20} /> Accept All
                  </button>
                  <button
                    className="btn btn-error text-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all gap-2"
                    onClick={handleRejectClick}
                  >
                    <X size={20} /> Reject All
                  </button>
                </div>
              ) : (
                <div className="flex justify-center gap-6 w-full">
                  <button
                    className="btn btn-circle btn-lg btn-success text-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all"
                    onClick={handleAcceptClick}
                    disabled={isFetchingCurrent}
                    title="Accept Suggestion"
                  >
                    <Check size={28} />
                  </button>
                  <button
                    className="btn btn-circle btn-lg btn-error text-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all"
                    onClick={handleRejectClick}
                    title="Reject Value"
                  >
                    <X size={28} />
                  </button>
                  <button
                    className="btn btn-circle btn-lg btn-neutral btn-outline bg-base-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
                    onClick={() => setIsEditing(true)}
                    title="Manual Edit"
                  >
                    <Edit2 size={24} />
                  </button>
                </div>
              )}
            </div>

            {/* Carousel Navigation */}
            <div className="flex justify-between items-center mt-4 w-full px-2 shrink-0">
              <button
                className="btn btn-ghost btn-circle hover:bg-base-200 text-base-content/60 hover:text-base-content transition-colors flex-shrink-0"
                onClick={handlePrev}
                disabled={currentIndex === 0}
              >
                <ChevronLeft size={24} />
              </button>

              <div className="flex gap-1.5 flex-1 justify-center items-center px-2 overflow-hidden">
                {slides.length <= 10 ? (
                  unresolvedIssues.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-2 flex-shrink-0 rounded-full transition-all duration-300 ${
                        idx === currentIndex ? 'w-6 bg-primary' : 'w-2 bg-base-300'
                      }`}
                    />
                  ))
                ) : (
                  <span className="text-xs font-semibold text-base-content/40 tracking-wider">
                    {currentIndex + 1} / {slides.length}
                  </span>
                )}
              </div>

              <button
                className="btn btn-ghost btn-circle hover:bg-base-200 text-base-content/60 hover:text-base-content transition-colors flex-shrink-0"
                onClick={handleNext}
                disabled={currentIndex === slides.length - 1}
              >
                <ChevronRight size={24} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
