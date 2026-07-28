import type { ExtractedData } from '../../../../models/TableData';

export interface ReviewField {
  rowId: string | number;
  column: string;
  value: string;
  confidence: number;
}

const DOCUMENT_QUALITY_FLOOR = 0.85;
const RELATIVE_OUTLIER_STDDEV = 1.5;

/**
 * Uses the table data and scan foe fields whoses confidence value is lower then
 * the 1.5 standard deviations from the average. If so, we push it into a list of fields to review.
 */
export function detectReviewFields(data: ExtractedData): ReviewField[] {
  const allConfidences = data.rows.flatMap((r) => Object.values(r._cellConfidence ?? {}));
  if (allConfidences.length === 0) return [];

  const mean = allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length;
  const variance =
    allConfidences.reduce((sum, c) => sum + (c - mean) ** 2, 0) / allConfidences.length;
  const stdDev = Math.sqrt(variance);

  const threshold =
    mean < DOCUMENT_QUALITY_FLOOR
      ? DOCUMENT_QUALITY_FLOOR
      : mean - RELATIVE_OUTLIER_STDDEV * stdDev;
  const fields: ReviewField[] = [];

  for (const row of data.rows) {
    for (const col of data.columns) {
      const confidence = row._cellConfidence?.[col];
      const value = row[col];

      if (confidence === undefined || typeof value !== 'string') continue;
      if (confidence < threshold) {
        fields.push({ rowId: row._id, column: col, value, confidence });
      }
    }
  }

  // lowest confidence first
  return fields.sort((a, b) => a.confidence - b.confidence);
}
