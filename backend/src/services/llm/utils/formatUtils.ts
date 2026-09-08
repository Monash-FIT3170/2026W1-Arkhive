// backend/src/services/llm/formatUtils.ts

export const COMMON_FORMAT_RULES = [
  { name: 'ISO_DATE', regex: /^\d{4}-\d{2}-\d{2}$/ },
  { name: 'US_DATE', regex: /^\d{1,2}\/\d{1,2}\/\d{2,4}$/ },
  { name: 'EU_DATE', regex: /^\d{1,2}\.\d{1,2}\.\d{2,4}$/ },
  { name: 'CURRENCY', regex: /^\$?\d{1,3}(,\d{3})*(\.\d{2})?$/ },
  { name: 'INTEGER', regex: /^\d+$/ },
  { name: 'DECIMAL', regex: /^\d+\.\d+$/ },
];

/**
 * Phase 1: Local Profiler
 * Checks if 80%+ of samples match a common known format.
 */
export function profileColumnLocally(samples: string[]): string | null {
  if (samples.length < 3) return null;

  for (const rule of COMMON_FORMAT_RULES) {
    const matchCount = samples.filter((val) => rule.regex.test(val.trim())).length;
    const matchRate = matchCount / samples.length;

    if (matchRate >= 0.8) {
      return rule.regex.source;
    }
  }
  return null;
}

/**
 * Phase 3: Converts Gemini's structural mask (e.g., 'AAA-9999') into a strict JS regex.
 */
export function maskToRegex(mask: string, isVariableLength: boolean): string {
  if (!mask || mask.trim() === '') return '.*';

  if (isVariableLength) {
    if (mask.includes('.')) return '^\\d+(\\.\\d+)?$';
    if (/^[9]+$/.test(mask)) return '^\\d+$';
    return '.*';
  }

  let regexStr = '^';
  let i = 0;

  while (i < mask.length) {
    const char = mask[i];

    if (char === '9') {
      let count = 0;
      while (i < mask.length && mask[i] === '9') {
        count++;
        i++;
      }
      regexStr += `\\d{${count}}`;
    } else if (char === 'A') {
      let count = 0;
      while (i < mask.length && mask[i] === 'A') {
        count++;
        i++;
      }
      regexStr += `[A-Z]{${count}}`;
    } else if (char === 'a') {
      let count = 0;
      while (i < mask.length && mask[i] === 'a') {
        count++;
        i++;
      }
      regexStr += `[a-z]{${count}}`;
    } else if (char === 'X') {
      let count = 0;
      while (i < mask.length && mask[i] === 'X') {
        count++;
        i++;
      }
      regexStr += `[A-Za-z0-9]{${count}}`;
    } else {
      regexStr += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }

  regexStr += '$';
  return regexStr;
}
