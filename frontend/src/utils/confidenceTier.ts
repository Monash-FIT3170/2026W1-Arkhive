/**
 * Confidence tier for a row/field. Thresholds: >=0.85 high (green),
 * 0.70-0.84 medium (amber), <0.70 low (red, triggers the warning icon).
 */
export function getConfidenceTier(confidence: number): {
  colour: string;
  label: string;
  isLow: boolean;
  badgeClass?: string;
} {
  const percent = Math.round(confidence * 100);
  if (confidence >= 0.85) {
    return {
      colour: '#22c55e',
      label: `${percent}% - High`,
      isLow: false,
      badgeClass: 'badge-success',
    };
  } else if (confidence >= 0.7) {
    return {
      colour: '#f59e0b',
      label: `${percent}% - Medium`,
      isLow: false,
      badgeClass: 'badge-warning',
    };
  }
  return { colour: '#f59e0b', label: `${percent}% - Low`, isLow: true, badgeClass: 'badge-error' };
}
