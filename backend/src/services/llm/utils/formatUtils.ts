// backend/src/services/llm/formatUtils.ts

export const COMMON_FORMAT_RULES = [
  // Dates
  { name: 'ISO_DATE', regex: /^\d{4}-\d{2}-\d{2}$/ },
  { name: 'US_DATE', regex: /^\d{1,2}\/\d{1,2}\/\d{2,4}$/ },
  { name: 'EU_DATE', regex: /^\d{1,2}\.\d{1,2}\.\d{2,4}$/ },
  {
    name: 'TEXT_DATE',
    regex: /^(?:\d{1,2}(?:st|nd|rd|th)?\s+)?[A-Za-z]+\s+\d{1,2}(?:,\s*|\s+)\d{4}$/,
  },

  // Time
  { name: 'ID_TIME', regex: /^(?:[01]\d|2[0-3])[:.][0-5]\d\s*(?:WIB|WITA|WIT)$/i },
  { name: 'TIME_24H', regex: /^(?:[01]\d|2[0-3]):[0-5]\d$/ },
  { name: 'TIME_12H', regex: /^(?:0?[1-9]|1[0-2]):[0-5]\d\s?(?:AM|PM)$/i },

  // Currency
  { name: 'USD_CURRENCY', regex: /^\$-?\d{1,3}(,\d{3})*(\.\d{2})?$/ },
  { name: 'AUD_CURRENCY', regex: /^A\$-?\d{1,3}(,\d{3})*(\.\d{2})?$/ },
  { name: 'EUR_CURRENCY', regex: /^€-?\d{1,3}(?:\.\d{3})*(,\d{2})?$/ },
  { name: 'GBP_CURRENCY', regex: /^£-?\d{1,3}(,\d{3})*(\.\d{2})?$/ },
  {
    name: 'IDR_CURRENCY',
    regex: /^Rp\.?\s?-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?$/i,
  },

  // Country Specific Identifiers
  { name: 'ID_NIK', regex: /^\d{16}$/ },
  { name: 'ID_POSTCODE', regex: /^\d{5}$/ },
  { name: 'ID_NPWP', regex: /^\d{2}\.?\d{3}\.?\d{3}\.?\d-\d{3}\.?\d{3}$/ },
  { name: 'AU_POSTCODE', regex: /^\d{4}$/ },
  { name: 'AU_ABN', regex: /^\d{2}\s?\d{3}\s?\d{3}\s?\d{3}$/ },
  { name: 'AU_ACN', regex: /^\d{3}\s?\d{3}\s?\d{3}$/ },

  // Identifiers
  {
    name: 'UUID',
    regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },

  // Contact
  { name: 'EMAIL', regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
  { name: 'PHONE', regex: /^\+?[\d\s().-]{7,20}$/ },

  // Percentages
  { name: 'PERCENTAGE', regex: /^-?\d+(?:\.\d+)?%$/ },

  // Other specific formats
  { name: 'YES_NO', regex: /^(yes|no)$/i },
  { name: 'YEAR', regex: /^(?:19|20)\d{2}$/ },

  // Numbers
  { name: 'NUMBER_WITH_COMMAS', regex: /^-?\d{1,3}(,\d{3})+$/ },
  { name: 'NUMBER_WITH_SPACES', regex: /^-?\d{1,3}( \d{3})+$/ },
  { name: 'DECIMAL', regex: /^-?\d+\.\d+$/ },
  { name: 'INTEGER', regex: /^-?\d+$/ },

  // Generic formats - keep these last
  { name: 'POSTCODE', regex: /^\d{4,6}$/ },
  { name: 'ALPHANUMERIC_ID', regex: /^[A-Za-z0-9_-]+$/ },

  // Web
  { name: 'URL', regex: /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i },
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
