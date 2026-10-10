import { useState } from 'react';
import { AlertTriangle, Edit2 } from 'lucide-react';
import type { ExtractedField, ExtractedText } from '../../../../models/TableData';
import { getConfidenceTier } from '../../../../utils/confidenceTier';

interface Props {
  fields: ExtractedField[];
  texts: ExtractedText[];
  isEditMode?: boolean;
  editedIds?: Set<string>;
  onEdit?: (id: string, newValue: string) => void;
  onHover?: (id: string | null) => void;
}

const ROLE_LABEL: Record<ExtractedText['role'], string> = {
  title: 'Title',
  heading: 'Heading',
  paragraph: 'Text',
  footer: 'Footer',
};

export default function ExtractedFieldsSection({
  fields,
  texts,
  isEditMode,
  editedIds,
  onEdit,
  onHover,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [initial, setInitial] = useState('');

  if (fields.length === 0 && texts.length === 0) return null;

  const begin = (id: string, value: string) => {
    if (!isEditMode) return;
    setEditingId(id);
    setDraft(value);
    setInitial(value);
  };
  const commit = (id: string) => {
    if (draft !== initial) onEdit?.(id, draft);
    setEditingId(null);
  };

  const renderValue = (id: string, value: string, multiline: boolean) =>
    editingId === id ? (
      <textarea
        autoFocus
        rows={multiline ? 3 : 1}
        value={draft}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commit(id);
          } else if (e.key === 'Escape') {
            setEditingId(null);
          }
        }}
        className="w-full bg-base-100 text-base-content text-[13px] leading-snug p-1.5 rounded border border-primary ring-2 ring-primary/20 outline-none resize-none"
      />
    ) : (
      <div
        className={`relative text-[13px] break-words whitespace-pre-wrap ${
          isEditMode ? 'cursor-pointer' : ''
        }`}
        onClick={() => begin(id, value)}
      >
        {editedIds?.has(id) && (
          <Edit2 className="w-2.5 h-2.5 text-warning absolute top-0 right-0 opacity-60" />
        )}
        {value || <span className="text-base-content/40">—</span>}
      </div>
    );

  return (
    <div className="flex-1 overflow-auto pb-4 space-y-3 pr-2" data-testid="fields-section">
      {fields.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {fields.map((f) => {
            const tier = getConfidenceTier(f.confidence);
            return (
              <div
                key={f.id}
                className={`rounded-md border px-2.5 py-1.5 transition-colors hover:bg-warning/10 ${
                  tier.isLow ? 'border-error/40 bg-error/10' : 'border-base-300 bg-base-100'
                }`}
                onMouseEnter={() => onHover?.(f.id)}
                onMouseLeave={() => onHover?.(null)}
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                    {f.label || f.key}
                  </span>
                  {tier.isLow && (
                    <span title={`Low confidence (${tier.label}) - please check this value`}>
                      <AlertTriangle className="w-3 h-3 text-error flex-shrink-0" />
                    </span>
                  )}
                </div>
                {renderValue(f.id, f.value, false)}
              </div>
            );
          })}
        </div>
      )}

      {texts.length > 0 && (
        <div className="space-y-1.5">
          {texts.map((t) => {
            const tier = getConfidenceTier(t.confidence);
            return (
              <div
                key={t.id}
                className={`flex gap-2 rounded-md border px-2.5 py-1.5 transition-colors hover:bg-warning/10 ${
                  tier.isLow ? 'border-error/40 bg-error/10' : 'border-base-300 bg-base-100'
                }`}
                onMouseEnter={() => onHover?.(t.id)}
                onMouseLeave={() => onHover?.(null)}
              >
                <span className="mt-0.5 w-14 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-base-content/60">
                  {ROLE_LABEL[t.role]}
                </span>
                <div className="min-w-0 flex-1">{renderValue(t.id, t.text, true)}</div>
                {tier.isLow && (
                  <span title={`Low confidence (${tier.label})`}>
                    <AlertTriangle className="w-3 h-3 text-error flex-shrink-0" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
