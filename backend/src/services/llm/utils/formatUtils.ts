// backend/src/services/llm/formatUtils.ts

export const COMMON_FORMAT_RULES = [
  { name: 'ISO_DATE', regex: /^\d{4}-\d{2}-\d{2}$/ },
  { name: 'US_DATE', regex: /^\d{1,2}\/\d{1,2}\/\d{2,4}$/ },
  { name: 'EU_DATE', regex: /^\d{1,2}\.\d{1,2}\.\d{2,4}$/ },
  { name: 'CURRENCY', regex: /^\$\d{1,3}(,\d{3})*(\.\d{2})?$/ },
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

// Maps each mask token to its JS regex character-class equivalent.
const MASK_TOKEN_PATTERNS: Record<string, string> = {
  '9': '\\d',
  A: '[A-Z]',
  a: '[a-z]',
  X: '[A-Za-z0-9]',
};

/**
 * Phase 3: Converts Gemini's structural mask (e.g., 'AAA-9999') into a strict JS regex.
 */
export function maskToRegex(mask: string, isVariableLength: boolean): string {
  if (!mask || mask.trim() === '') return '.*';

  // Try to detect a repeating "[token-run][literal separator]" structure
  if (isVariableLength) {
    const repeating = detectRepeatingGroup(mask);
    if (repeating) {
      const { tokenChar, sep, isNumericGrouping } = repeating;
      const pattern = MASK_TOKEN_PATTERNS[tokenChar];
      const escSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return isNumericGrouping
        ? `^${pattern}{1,3}(${escSep}${pattern}{3})*$`
        : `^${pattern}+(${escSep}${pattern}+)*$`;
    }
  }

  let regexStr = '^';
  let i = 0;

  while (i < mask.length) {
    const char = mask[i];
    const pattern = MASK_TOKEN_PATTERNS[char];

    if (pattern) {
      let count = 0;
      while (i < mask.length && mask[i] === char) {
        count++;
        i++;
      }
      regexStr += isVariableLength ? `${pattern}+` : `${pattern}{${count}}`;
    } else {
      regexStr += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i++;
    }
  }

  regexStr += '$';
  return regexStr;
}

/**
 * Detects a mask that is a run of the same mask-token type, repeated and
 * joined by a single literal separator character (e.g. '9,999,999',
 * 'AAA-AAA-AAA'). Returns null if the mask isn't shaped that way.
 */
function detectRepeatingGroup(
  mask: string
): { tokenChar: string; sep: string; isNumericGrouping: boolean } | null {
  // Split on the first non-token character we find, then verify every
  // other segment uses that same separator and every segment is made of
  // the same token character.
  let sepChar: string | null = null;
  const segments: string[] = [];
  let current = '';

  for (const char of mask) {
    if (MASK_TOKEN_PATTERNS[char]) {
      current += char;
    } else {
      if (sepChar === null) sepChar = char;
      if (char !== sepChar) return null; // mixed separators, bail
      segments.push(current);
      current = '';
    }
  }
  segments.push(current);

  if (!sepChar || segments.length < 2) return null;
  if (segments.some((s) => s.length === 0)) return null;

  const tokenChar = segments[0][0];
  const allSameToken = segments.every((s) => [...s].every((c) => c === tokenChar));
  if (!allSameToken) return null;

  return {
    tokenChar,
    sep: sepChar,
    isNumericGrouping: tokenChar === '9' && sepChar === ',',
  };
}
