import React, { useState, useEffect } from 'react';
import { 
  Check,
  X,
  ChevronLeft, 
  ChevronRight, 
  AlertCircle, 
  Edit2, 
  CheckCircle2,
  Bot
} from 'lucide-react';

// Acknowledgement: Google Gemini was used to help generate this file

export interface OcrIssue {
  fieldId: string;
  fieldName: string;
  ocrValue: string;
  confidenceScore: number;
}

interface OcrReviewWidgetProps {
  issues: OcrIssue[];
  onAccept: (fieldId: string, newValue: string) => void;
  onReject: (fieldId: string) => void;
  onManualEdit: (fieldId: string, newValue: string) => void;
  onSlideChange?: (fieldId: string) => void; // Optional: Emits when slide changes to highlight field in main document
  onFetchSuggestion?: (fieldId: string) => Promise<string | null>;
}

export default function OcrReviewWidget({ 
  issues, 
  onAccept, 
  onReject, 
  onManualEdit,
  onSlideChange,
  onFetchSuggestion
}: OcrReviewWidgetProps) {
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [manualValue, setManualValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  
  const [suggestions, setSuggestions] = useState<Record<string, string | null>>({});
  const [isFetchingSuggestion, setIsFetchingSuggestion] = useState(false);
  
  // Filter out issues that have already been resolved
  const unresolvedIssues = issues.filter(issue => !resolvedIds.has(issue.fieldId));
  
  // Emit event when the slide changes so parent can highlight the document
  useEffect(() => {
    const currentIssue = unresolvedIssues[currentIndex];
    if (unresolvedIssues.length > 0 && onSlideChange && currentIssue) {
       onSlideChange(currentIssue.fieldId);
    }
    
    // Fetch AI suggestion if not already fetched
    if (currentIssue && onFetchSuggestion) {
      setSuggestions(prev => {
        if (prev[currentIssue.fieldId] !== undefined) return prev;
        
        setIsFetchingSuggestion(true);
        onFetchSuggestion(currentIssue.fieldId).then(val => {
          setSuggestions(s => ({...s, [currentIssue.fieldId]: val}));
          setIsFetchingSuggestion(false);
        });
        
        return { ...prev, [currentIssue.fieldId]: null }; // Mark as fetching
      });
    }
  }, [currentIndex, unresolvedIssues.length, onSlideChange, onFetchSuggestion, unresolvedIssues]);

  const handleNext = () => {
    if (currentIndex < unresolvedIssues.length - 1) {
      setCurrentIndex(prev => prev + 1);
      resetEditState();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      resetEditState();
    }
  };

  const resetEditState = () => {
    setIsEditing(false);
    setManualValue("");
  };

  const markAsResolved = (fieldId: string) => {
    setResolvedIds(prev => {
      const next = new Set(prev);
      next.add(fieldId);
      return next;
    });

    resetEditState();
    // Maintain slide index smoothly. If we resolve the last item, step back one index.
    if (currentIndex >= unresolvedIssues.length - 1) {
      setCurrentIndex(Math.max(0, unresolvedIssues.length - 2));
    }
  };

  // Handlers matching requirements
  const handleAcceptClick = () => {
    const currentIssue = unresolvedIssues[currentIndex];
    if (!currentIssue) return;
    const finalValue = suggestions[currentIssue.fieldId] || currentIssue.ocrValue;
    onAccept(currentIssue.fieldId, finalValue);
    markAsResolved(currentIssue.fieldId);
  };

  const handleRejectClick = () => {
    const currentIssue = unresolvedIssues[currentIndex];
    if (!currentIssue) return;
    onReject(currentIssue.fieldId);
    markAsResolved(currentIssue.fieldId);
  };

  const handleManualSubmit = () => {
    if (manualValue.trim()) {
      const currentIssue = unresolvedIssues[currentIndex];
      if (!currentIssue) return;
      onManualEdit(currentIssue.fieldId, manualValue.trim());
      markAsResolved(currentIssue.fieldId);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-base-200/30 overflow-hidden font-sans">
      <div className="p-6 h-full flex flex-col relative">
        {unresolvedIssues.length === 0 ? (
           // Success State
           <div className="flex-1 flex flex-col items-center justify-center text-success gap-4 animate-in fade-in zoom-in duration-500">
             <div className="bg-success/20 p-5 rounded-full shadow-inner">
               <CheckCircle2 size={64} className="text-success" />
             </div>
             <div className="text-center">
               <p className="font-bold text-2xl text-base-content">All Clear!</p>
               <p className="text-sm text-base-content/60 mt-2">You've resolved all flagged issues.</p>
             </div>
           </div>
        ) : (
           // Carousel Interface
           <div className="flex-1 flex flex-col h-full animate-in fade-in duration-300">
             {/* Progress Indicator */}
             <div className="text-xs font-semibold text-base-content/50 mb-6 text-center uppercase tracking-widest">
               Issue {currentIndex + 1} of {unresolvedIssues.length}
             </div>
             
             {/* Carousel Slide */}
             <div className="flex-1 flex flex-col justify-center items-center text-center space-y-5 transition-all w-full">
                <div className="bg-base-100 px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-primary shadow-sm border border-primary/20">
                  {unresolvedIssues[currentIndex]?.fieldName}
                </div>
                
                <div className="w-full relative group space-y-4 text-left">
                   {/* Detected Value */}
                   <div>
                     <p className="text-xs text-base-content/60 font-semibold mb-1 uppercase tracking-wider ml-1 flex justify-between items-center">
                        Detected Data
                        <span className="text-[10px] font-medium text-warning flex items-center gap-1 bg-warning/10 px-2 py-0.5 rounded-full">
                           <AlertCircle size={12} />
                           {(unresolvedIssues[currentIndex]?.confidenceScore * 100).toFixed(0)}%
                        </span>
                     </p>
                     <div className="bg-base-100 relative p-4 rounded-xl w-full border border-base-300 shadow-sm">
                       <p className="text-lg font-medium break-all text-base-content line-through opacity-60">
                         "{unresolvedIssues[currentIndex]?.ocrValue}"
                       </p>
                     </div>
                   </div>

                   {/* AI Suggestion */}
                   <div>
                     <p className="text-xs text-primary/80 font-semibold mb-1 uppercase tracking-wider ml-1 flex items-center gap-1.5">
                       <Bot size={14} /> AI Suggestion
                     </p>
                     <div className="bg-primary/5 relative p-4 rounded-xl w-full border border-primary/20 shadow-sm">
                       {isFetchingSuggestion && suggestions[unresolvedIssues[currentIndex]?.fieldId] === undefined ? (
                         <div className="flex items-center justify-center gap-2 py-1 text-primary/60">
                           <span className="loading loading-spinner loading-sm"></span>
                           <span className="text-sm font-medium animate-pulse">Analyzing document context...</span>
                         </div>
                       ) : (
                         <p className="text-xl font-bold break-all text-primary-content bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                           "{suggestions[unresolvedIssues[currentIndex]?.fieldId] || unresolvedIssues[currentIndex]?.ocrValue}"
                         </p>
                       )}
                     </div>
                   </div>
                </div>
             </div>

             {/* Resolution Actions */}
             <div className="mt-8 h-14 flex items-center justify-center w-full">
               {isEditing ? (
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
                   <button className="btn btn-primary shadow-md" onClick={handleManualSubmit}>Save</button>
                   <button className="btn btn-ghost" onClick={resetEditState}>Cancel</button>
                 </div>
               ) : (
                 <div className="flex justify-center gap-6 w-full">
                   <button 
                     className="btn btn-circle btn-lg btn-success text-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all"
                     onClick={handleAcceptClick}
                     disabled={isFetchingSuggestion && suggestions[unresolvedIssues[currentIndex]?.fieldId] === undefined}
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
             <div className="flex justify-between items-center mt-8 w-full px-2">
               <button 
                 className="btn btn-ghost btn-circle hover:bg-base-200 text-base-content/60 hover:text-base-content transition-colors" 
                 onClick={handlePrev}
                 disabled={currentIndex === 0}
               >
                 <ChevronLeft size={24} />
               </button>
               
               <div className="flex gap-2.5">
                 {unresolvedIssues.map((_, idx) => (
                   <div 
                     key={idx} 
                     className={`h-2 rounded-full transition-all duration-300 ${
                       idx === currentIndex ? 'w-6 bg-primary' : 'w-2 bg-base-300'
                     }`} 
                   />
                 ))}
               </div>
               
               <button 
                 className="btn btn-ghost btn-circle hover:bg-base-200 text-base-content/60 hover:text-base-content transition-colors" 
                 onClick={handleNext}
                 disabled={currentIndex === unresolvedIssues.length - 1}
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
