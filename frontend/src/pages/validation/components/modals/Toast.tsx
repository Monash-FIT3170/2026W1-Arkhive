import { useEffect, useRef } from 'react';
import { Check, AlertCircle, AlertTriangle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  open: boolean;
  message: string;
  type?: ToastType;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  duration?: number;
}

function Toast({
  open,
  message,
  type = 'success',
  actionLabel,
  onAction,
  onDismiss,
  duration = 5000,
}: ToastProps) {
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

  const icons = {
    success: <Check className="w-4 h-4 text-success flex-shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-error flex-shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />,
    info: <Info className="w-4 h-4 text-info flex-shrink-0" />
  };

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[100] pointer-events-auto">
      <div className={`alert bg-base-100 border border-base-300 shadow-xl flex items-center gap-3 py-2.5 px-4 rounded-xl`}>
        {icons[type]}
        <span className="text-sm font-medium text-base-content">{message}</span>
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
