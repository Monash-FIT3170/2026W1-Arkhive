// Floating OCR progress window. Opens automatically when the user presses
// "Process", can be minimised to a small corner pill, and keeps showing every
// queued / running / finished task while the user moves around the app.
// Drag + resize come from useFloatingWindow (same hook as the other floating UI).

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, FileText, Minus, X } from 'lucide-react';
import { useOcrProgress } from '../../context/OcrProgressContext';
import { isTaskActive, type OcrTask } from '../../models/OcrTask';
import { useFloatingWindow } from '../../hooks/useFloatingWindow';
import { estimateRemainingMs, formatRemaining, progressPercent } from '../../utils/ocrProgress';

function progressClass(task: OcrTask): string {
  switch (task.status) {
    case 'completed':
      return task.failedDocuments > 0 ? 'progress-warning' : 'progress-success';
    case 'failed':
      return 'progress-error';
    case 'cancelled':
      return 'progress-neutral';
    default:
      return 'progress-primary';
  }
}

function TaskRow({
  task,
  now,
  onCancel,
}: {
  task: OcrTask;
  now: number;
  onCancel: (id: string) => void;
}) {
  const percent = progressPercent(task, now);
  const remainingMs = estimateRemainingMs(task, now);
  const remaining = remainingMs === null ? null : formatRemaining(remainingMs);
  const pagesText = `${task.totalPages} ${task.totalPages === 1 ? 'page' : 'pages'}`;

  return (
    <li className="rounded-lg border border-base-300 bg-base-100 p-3" data-testid="ocr-task-row">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={task.label}>
            {task.label}
          </p>
          <p className="text-xs text-base-content/60">
            {pagesText}
            {remaining ? ` · ${remaining}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-bold tabular-nums">{task.status === 'queued' ? '—' : `${percent}%`}</span>
          {isTaskActive(task) && (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-error"
              onClick={() => onCancel(task.id)}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <progress
        className={`progress ${progressClass(task)} mt-2 w-full`}
        value={task.status === 'queued' ? 0 : percent}
        max={100}
      />

      <p
        className={`mt-1.5 truncate text-xs ${
          task.status === 'failed' ? 'text-error' : task.failedDocuments > 0 ? 'text-warning' : 'text-base-content/60'
        }`}
        title={task.error ?? task.message}
      >
        {task.status === 'failed' && task.error ? task.error : task.message}
      </p>
    </li>
  );
}

export default function OcrProgressPopup() {
  const navigate = useNavigate();
  const { tasks, isMinimised, setMinimised, cancelTask, cancelAll, clearFinished } = useOcrProgress();
  const { rect, dragProps, resizeProps } = useFloatingWindow({
    storageKey: 'arkhive_ocr_progress_window',
    defaultSize: { width: 380, height: 360 },
    minSize: { width: 320, height: 220 },
  });

  const active = tasks.filter(isTaskActive);
  const hasProcessing = tasks.some((task) => task.status === 'processing');

  // Tick once a second so the "time left" estimate keeps moving between backend events.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [hasProcessing]);

  if (tasks.length === 0) return null;

  const isRunning = active.length > 0;
  const hasErrors = tasks.some((task) => task.status === 'failed' || task.failedDocuments > 0);
  const hasResults = tasks.some((task) => task.status === 'completed');

  const totalPages = active.reduce((sum, task) => sum + task.totalPages, 0);
  const weightedPercent = active.reduce((sum, task) => sum + progressPercent(task, now) * task.totalPages, 0);
  const overallPercent = totalPages > 0 ? Math.round(weightedPercent / totalPages) : 0;

  const statusLabel = isRunning
    ? 'STATUS: IN PROGRESS'
    : hasErrors
      ? 'STATUS: FINISHED WITH ERRORS'
      : 'STATUS: COMPLETE';
  const statusClass = isRunning ? 'badge-info' : hasErrors ? 'badge-warning' : 'badge-success';

  function reviewResults() {
    setMinimised(true);
    navigate('/validation');
  }

  // ── Minimised pill ──────────────────────────────────────────────────────────
  if (isMinimised) {
    return (
      <button
        type="button"
        className="btn btn-primary fixed bottom-6 right-6 z-40 gap-2 rounded-full shadow-xl"
        onClick={() => setMinimised(false)}
        aria-label="Open OCR progress"
        data-testid="ocr-progress-pill"
      >
        {isRunning ? (
          <>
            <span className="loading loading-spinner loading-xs" />
            <span>
              OCR {active.length} {active.length === 1 ? 'task' : 'tasks'} · {overallPercent}%
            </span>
          </>
        ) : (
          <>
            <Check className="h-4 w-4" aria-hidden />
            <span>{hasErrors ? 'OCR finished with errors' : 'OCR complete'}</span>
          </>
        )}
      </button>
    );
  }

  // ── Expanded window ─────────────────────────────────────────────────────────
  return (
    <div
      className="fixed z-40 flex flex-col overflow-hidden rounded-xl border border-base-300 bg-base-200 shadow-2xl"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
      role="dialog"
      aria-label="OCR progress"
      data-testid="ocr-progress-window"
    >
      <div
        {...dragProps}
        className="flex shrink-0 cursor-grab touch-none select-none items-center justify-between gap-2 border-b border-base-300 bg-base-100 px-3 py-2 active:cursor-grabbing"
        title="Drag to move"
      >
        <div className="pointer-events-none flex min-w-0 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-sm font-bold">OCR Processing</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge badge-sm font-semibold ${statusClass}`}>{statusLabel}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-circle"
            title="Minimise"
            aria-label="Minimise OCR progress"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setMinimised(true)}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto p-3">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} now={now} onCancel={cancelTask} />
        ))}
      </ul>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-base-300 bg-base-100 px-3 py-2">
        {isRunning ? (
          <button type="button" className="btn btn-outline btn-error btn-xs" onClick={cancelAll}>
            {active.length > 1 ? 'Cancel all' : 'Cancel'}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-xs gap-1" onClick={clearFinished}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear
          </button>
        )}
        {!isRunning && hasResults && (
          <button type="button" className="btn btn-primary btn-xs gap-1" onClick={reviewResults}>
            Review results
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {/* Resize handle (bottom-right) */}
      <div
        {...resizeProps('se')}
        className="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-nwse-resize touch-none"
        title="Resize"
      />
    </div>
  );
}