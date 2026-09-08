import { useState} from 'react';
import { createPortal } from 'react-dom';
import type { PreviewItem } from '../types';

type Props = {
  items: { index: number; item: PreviewItem }[];
  onComplete: (updates: { index: number; documentType: string }[]) => void;
  onCancel: () => void;
};

const DOCUMENT_TYPES = ['Receipt', 'Invoice', 'Form', 'Record', 'Other'];

export default function ClassificationModal({ items, onComplete, onCancel }: Props) {
  const [selections, setSelections] = useState<Record<number, string>>({});

  // Adjust selections during render whenever `items` changes, instead of
  // syncing it via an effect.
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    const initial: Record<number, string> = {};
    items.forEach(({ index, item }) => {
      initial[index] = item.documentType || '';
            /**
       * TODO (AI Integration):
       * Here we could call an AI service (e.g. vision model) to predict the document type
       * based on `item.previewSrc` (image data URL) or actual file contents.
       * e.g. `const predictedType = await predictType(item.previewSrc);`
       *      `initial[index] = predictedType;`
       */
    });
    setSelections(initial);
  }

  const handleSelect = (index: number, type: string) => {
    setSelections(prev => ({ ...prev, [index]: type }));
  };

  const handleApplyToAll = (type: string) => {
    const next: Record<number, string> = { ...selections };
    items.forEach(({ index }) => {
      next[index] = type;
    });
    setSelections(next);
  };

  const handleConfirm = () => {
    const updates = items.map(({ index }) => ({
      index,
      documentType: selections[index] || 'Other'
    }));
    onComplete(updates);
  };

  return createPortal(
    <div className="modal modal-open z-[9999] bg-black/60 backdrop-blur-sm">
      <div className="modal-box w-11/12 max-w-5xl flex flex-col max-h-[90vh]">
        <h3 className="font-bold text-2xl mb-2">Classify Documents</h3>
        <p className="text-base-content/70 mb-4">
          Please select the document type for each uploaded file.
        </p>

        {items.length > 1 && (
          <div className="flex items-center gap-3 mb-6 p-4 bg-base-200 rounded-xl border border-base-300">
            <span className="text-sm font-semibold">Bulk Action:</span>
            <select
              className="select select-sm select-bordered max-w-xs"
              onChange={(e) => {
                if (e.target.value) {
                  handleApplyToAll(e.target.value);
                  e.target.value = ""; // reset to default option
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>Apply type to all...</option>
              {DOCUMENT_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {items.map(({ index, item }) => (
            <div key={index} className="flex flex-col md:flex-row items-center gap-6 p-4 rounded-xl border border-base-300 bg-base-100 hover:border-primary/50 transition-colors">
              <div className="h-56 w-40 md:w-48 shrink-0 rounded-lg overflow-hidden border border-base-200 bg-base-200 flex items-center justify-center p-2">
                {item.hasFile && item.isImage ? (
                  <img src={item.previewSrc} alt={item.label} className="h-full w-full object-contain" />
                ) : (
                  <div className="text-xs text-base-content/50">No Preview</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold truncate text-lg">{item.label}</h4>
                {item.subtitle && <p className="text-sm text-base-content/60 truncate">{item.subtitle}</p>}
                {item.documentType && <p className="text-xs text-primary mt-1">Current: {item.documentType}</p>}
              </div>
              <div className="w-full md:w-64 shrink-0">
                <select
                  className="select select-bordered w-full"
                  value={selections[index] || ''}
                  onChange={(e) => handleSelect(index, e.target.value)}
                >
                  <option value="" disabled>Select type...</option>
                  {DOCUMENT_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="modal-action mt-6 pt-4 border-t border-base-200">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm}>Confirm Classification</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
