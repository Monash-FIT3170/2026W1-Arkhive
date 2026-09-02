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

  if (isVariableLength) {
    const group = detectRepeatingGroup(mask);
    if (group) return buildRepeatingGroupRegex(group);
  }

  const body = walkMask(mask, isVariableLength);
  return isVariableLength ? allowOptionalSign(mask, body) : body;
}

/**
 * Detects a mask that is a run of the same mask-token type, repeated and
 * joined by a single literal separator character (e.g. '9,999,999',
 * 'AAA-AAA-AAA'). Returns null if the mask isn't shaped that way.
 */
function detectRepeatingGroup(mask: string): RepeatingGroup | null {
  let separator: string | null = null;
  const segments: string[] = [];
  let current = '';

  for (const char of mask) {
    if (MASK_TOKEN_PATTERNS[char]) {
      current += char;
      continue;
    }
    if (char === '.') return null;
    if (separator === null) separator = char;
    if (char !== separator) return null;
    segments.push(current);
    current = '';
  }
  segments.push(current);

  if (!separator || segments.length < 2 || segments.some((s) => s.length === 0)) return null;

  const tokenChar = segments[0][0];
  const sameTokenThroughout = segments.every((s) => [...s].every((c) => c === tokenChar));
  return sameTokenThroughout ? { tokenChar, separator } : null;
}

/** Builds a regex for a repeating group, letting the number of groups vary. */
function buildRepeatingGroupRegex({ tokenChar, separator }: RepeatingGroup): string {
  const pattern = MASK_TOKEN_PATTERNS[tokenChar];
  const escSeparator = separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isThousandsSeparator = tokenChar === '9' && separator === ',';

  return isThousandsSeparator
    ? `^-?${pattern}{1,3}(${escSeparator}${pattern}{3})*$`
    : `^${pattern}+(${escSeparator}${pattern}+)*$`;
}

/** Walks the mask character-by-character, expanding token runs into regex classes. */
function walkMask(mask: string, isVariableLength: boolean): string {
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

  return regexStr + '$';
}

interface RepeatingGroup {
  tokenChar: string;
  separator: string;
}

/** Adds an optional leading '-' to purely numeric patterns that don't already have one. */
function allowOptionalSign(mask: string, regexStr: string): string {
  const isPurelyNumeric = /^[9,.\s-]+$/.test(mask) && mask.includes('9');
  if (!isPurelyNumeric || regexStr.startsWith('^-')) return regexStr;
  return regexStr.replace(/^\^/, '^-?');
}

/**
 * Sanity-checks a mask-derived regex against the samples it was supposedly
 * derived from. If Gemini's mask doesn't conform to its own source data
 * (e.g. due to a malformed or non-schema-conforming mask), we can't trust
 * the regex to be meaningful, so callers should fall back to a permissive
 * pattern rather than incorrectly flagging every value in the column.
 */
export function validateMaskRegex(mask: string, regexStr: string, samples: string[]): boolean {
  const allowedTokens = new Set(['A', 'a', 'X']);
  const hasInvalidLetter = [...mask].some((ch) => /[a-zA-Z]/.test(ch) && !allowedTokens.has(ch));
  if (hasInvalidLetter) return false;

  if (samples.length === 0) return true;
  try {
    const regex = new RegExp(regexStr);
    const matchCount = samples.filter((s) => regex.test(s.trim())).length;
    return matchCount / samples.length >= 0.15;
  } catch {
    return false; // malformed regex string — definitely don't trust it
  }
}
