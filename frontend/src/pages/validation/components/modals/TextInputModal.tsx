import { useEffect, useState } from 'react';

function TextInputModal({
  open,
  title,
  description,
  placeholder,
  initialValue = '',
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  if (!open) return null;

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (trimmed !== '') onConfirm(trimmed);
  };

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-sm">
        <h3 className="font-bold text-base">{title}</h3>
        {description && <p className="text-xs text-base-content/60 mt-1">{description}</p>}
        <input
          type="text"
          autoFocus
          className="input input-sm input-bordered w-full mt-3"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="modal-action">
          <button className="btn btn-sm btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={value.trim() === ''}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onCancel} />
    </div>
  );
}

export default TextInputModal;
