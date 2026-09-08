import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';

function Toast({
  open,
  message,
  actionLabel,
  onAction,
  onDismiss,
  duration = 5000,
}: {
  open: boolean;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  duration?: number;
}) {
  // Store latest onDismiss reference to prevent unnecessary effect re-runs
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      onDismissRef.current();
    }, duration);
    return () => clearTimeout(t);
  }, [open, duration]);

  if (!open) return null;

  return (
    // Changed from `toast toast-center toast-bottom` to fixed positioning
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
      <div className="alert bg-base-100 border border-base-300 shadow-xl flex items-center gap-3 py-2.5 px-4 rounded-xl">
        <Check className="w-4 h-4 text-success flex-shrink-0" />
        <span className="text-xs text-base-content">{message}</span>
        {actionLabel && onAction && (
          <button
            className="btn btn-ghost btn-xs text-primary font-semibold"
            onClick={() => {
              onAction();
              onDismiss();
            }}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default Toast;
