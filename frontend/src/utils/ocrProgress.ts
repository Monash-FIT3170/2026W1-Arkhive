import type { OcrTask } from '../models/OcrTask';

// The OCR backend only reports back when a whole document finishes, so the
// progress bar is an estimate: it advances with time, and jumps forward
// whenever a document really finishes. Tweak these numbers if the bar tends
// to run ahead of, or behind, the real OCR.
const BASE_MS = 10_000; // fixed cost of a run (upload to Azure, queueing, mapping)
const PER_PAGE_MS = 3_000; // extra time per page before we have measured anything
const MIN_EXPECTED_MS = 5_000;
const MAX_EXPECTED_MS = 120_000;

/** How long a task of `totalPages` pages should take, using a measured ms/page once we have one. */
export function estimateExpectedMs(totalPages: number, learnedMsPerPage: number | null): number {
  const estimate =
    learnedMsPerPage !== null ? learnedMsPerPage * totalPages : BASE_MS + PER_PAGE_MS * totalPages;
  return Math.round(Math.min(MAX_EXPECTED_MS, Math.max(MIN_EXPECTED_MS, estimate)));
}

/**
 * 0–100. Reaches 90% when the expected time has elapsed, then creeps toward
 * 99% so it never looks frozen. Only a finished task shows 100%. Real
 * document completions lift the bar if they get ahead of the clock.
 */
export function progressPercent(task: OcrTask, now: number): number {
  if (task.status === 'completed') return 100;
  if (task.status === 'queued' || !task.startedAt) return 0;

  const end = task.finishedAt ?? now; // freeze the bar for failed / cancelled tasks
  const t = Math.max(0, end - task.startedAt) / task.expectedMs;
  const timeBased = t < 1 ? 0.9 * t : 0.9 + 0.09 * (1 - 1 / t);
  const documentBased =
    task.documentCount > 0 ? (task.documentsDone / task.documentCount) * 0.99 : 0;

  return Math.min(99, Math.round(Math.max(timeBased, documentBased) * 100));
}

/**
 * Milliseconds left, or null when there is nothing to estimate (not running).
 * 0 means "past the expected time and still going".
 */
export function estimateRemainingMs(task: OcrTask, now: number): number | null {
  if (task.status !== 'processing' || !task.startedAt) return null;
  const elapsed = now - task.startedAt;

  // Once at least one document has really finished, extrapolate from that.
  if (task.documentsDone > 0 && task.documentsDone < task.documentCount) {
    return Math.round((elapsed / task.documentsDone) * (task.documentCount - task.documentsDone));
  }
  return Math.max(0, task.expectedMs - elapsed);
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Taking longer than expected…';
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `~${seconds}s left`;
  return `~${Math.floor(seconds / 60)}m ${seconds % 60}s left`;
}