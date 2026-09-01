import type { ExtractedData } from '../../../../models/TableData';
import type { ReviewField } from '../../../../models/Message';

// Absolute thresholds
const CRITICAL_FLOOR = 0.6; // Always flag below this, no matter what
const HIGH_CONFIDENCE_PASS = 0.95; // Never flag above this
const OUTLIER_MULTIPLIER = 2.0; // Multiplier for MAD threshold

function getMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculates Median Absolute Deviation (MAD)
 */
function getMAD(values: number[], median: number): number {
  const absoluteDeviations = values.map((v) => Math.abs(v - median));
  return getMedian(absoluteDeviations);
}

export function detectReviewFields(data: ExtractedData): ReviewField[] {
  const allConfidences = data.rows.flatMap((r) => Object.values(r._cellConfidence ?? {}));
  if (allConfidences.length === 0) return [];

  const median = getMedian(allConfidences);
  const mad = getMAD(allConfidences, median);

  // Dynamic cutoff: cells significantly lower than the median relative quality
  // If MAD is 0 (all values nearly identical), fall back to a small default dispersion.
  const dynamicThreshold = median - OUTLIER_MULTIPLIER * (mad || 0.05);

  // Bound the final threshold between our hard floor and max pass limit
  const effectiveThreshold = Math.min(
    Math.max(dynamicThreshold, CRITICAL_FLOOR),
    HIGH_CONFIDENCE_PASS
  );

  const fields: ReviewField[] = [];

  for (const row of data.rows) {
    for (const col of data.columns) {
      const confidence = row._cellConfidence?.[col];
      const value = row[col];

      if (confidence === undefined || typeof value !== 'string') continue;

      // Flag if below dynamic threshold OR below hard safety floor
      if (confidence < effectiveThreshold || confidence < CRITICAL_FLOOR) {
        fields.push({ rowId: row._id, column: col, value, confidence });
      }
    }
  }

  // Lowest confidence first
  return fields.sort((a, b) => a.confidence - b.confidence);
}
