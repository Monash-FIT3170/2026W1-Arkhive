import { describe, it, expect } from 'vitest';
import { profileColumnLocally } from './formatUtils';

describe('formatUtils', () => {
  describe('profileColumnLocally', () => {
    it('should detect ISO_DATE format when >= 80% match', () => {
      const samples = ['2026-08-31', '2026-01-15', '2025-12-01', '2026-05-10', 'invalid'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^\\d{4}-\\d{2}-\\d{2}$');
    });

    it('should detect US_DATE format correctly', () => {
      const samples = ['08/31/2026', '1/15/2026', '12/1/2025'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}$');
    });

    it('should detect EU_DATE format', () => {
      const samples = ['31.08.2026', '15.01.2026', '01.12.2025'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^\\d{1,2}\\.\\d{1,2}\\.\\d{2,4}$');
    });

    it('should detect TEXT_DATE format', () => {
      const samples = ['August 31, 2026', 'January 15, 2026', 'December 1, 2025', 'May 10, 2026'];

      const result = profileColumnLocally(samples);

      expect(result).toBe(
        '^(?:\\d{1,2}(?:st|nd|rd|th)?\\s+)?[A-Za-z]+\\s+\\d{1,2}(?:,\\s*|\\s+)\\d{4}$'
      );
    });

    it('should detect TIME_24H format', () => {
      const samples = ['09:30', '14:45', '23:59', '08:15'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^(?:[01]\\d|2[0-3]):[0-5]\\d$');
    });

    it('should detect TIME_12H format', () => {
      const samples = ['9:30 AM', '2:45 PM', '11:59 AM'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^(?:0?[1-9]|1[0-2]):[0-5]\\d\\s?(?:AM|PM)$');
    });

    it('should detect Indonesian time format', () => {
      const samples = ['09:30 WIB', '14:45 WIB', '08:15 WITA', '20:00 WIT'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^(?:[01]\\d|2[0-3])[:.][0-5]\\d\\s*(?:WIB|WITA|WIT)$');
    });

    it('should detect INTEGER format', () => {
      const samples = ['10', '250', '3000', '1'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^-?\\d+$');
    });

    it('should detect DECIMAL format', () => {
      const samples = ['10.50', '250.25', '3000.75', '1.25'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^-?\\d+\\.\\d+$');
    });

    it('should detect NUMBER_WITH_COMMAS format', () => {
      const samples = ['1,000', '2,500', '10,000', '250,000'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^-?\\d{1,3}(,\\d{3})+$');
    });

    it('should detect USD_CURRENCY format', () => {
      const samples = ['$10.00', '$1,250.50', '$50.00', '$2.50'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^\\$-?\\d{1,3}(,\\d{3})*(\\.\\d{2})?$');
    });

    it('should detect AUD_CURRENCY format', () => {
      const samples = ['A$10.00', 'A$1,250.50', 'A$50.00', 'A$2.50'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^A\\$-?\\d{1,3}(,\\d{3})*(\\.\\d{2})?$');
    });

    it('should detect Indonesian Rupiah currency format', () => {
      const samples = ['Rp 10.000', 'Rp 1.250.000', 'Rp 50.000', 'Rp 2.500'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^Rp\\.?\\s?-?\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})?$');
    });

    it('should detect PERCENTAGE format', () => {
      const samples = ['10%', '25%', '50.5%', '100%'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^-?\\d+(?:\\.\\d+)?%$');
    });

    it('should detect EMAIL format', () => {
      const samples = ['alice@example.com', 'bob@example.com', 'test@example.com'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
    });

    it('should detect Indonesian NIK format', () => {
      const samples = ['3174012345678901', '3273012345678902', '3374012345678903'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^\\d{16}$');
    });

    it('should detect Indonesian postcode format', () => {
      const samples = ['10110', '40115', '60231', '80113'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^\\d{5}$');
    });

    it('should detect AU postcode format', () => {
      const samples = ['3000', '2000', '4000', '6000'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^\\d{4}$');
    });

    it('should detect YES_NO format', () => {
      const samples = ['Yes', 'No', 'YES', 'No'];

      const result = profileColumnLocally(samples);

      expect(result).toBe('^(yes|no)$');
    });

    it('should return null if fewer than 3 samples are provided', () => {
      const samples = ['2026-08-31', '2026-01-15'];

      const result = profileColumnLocally(samples);

      expect(result).toBeNull();
    });

    it('should return null when fewer than 80% of samples match', () => {
      const samples = ['2026-08-31', 'not a date', 'random text!', '12.34.56', 'hello world'];

      const result = profileColumnLocally(samples);

      expect(result).toBeNull();
    });

    it('should return null for completely unrecognized formats', () => {
      const samples = ['hello world', 'something unusual', 'random value'];

      const result = profileColumnLocally(samples);

      expect(result).toBeNull();
    });
  });
});
