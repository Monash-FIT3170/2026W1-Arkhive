import { describe, it, expect } from 'vitest';
import { profileColumnLocally, maskToRegex } from './formatUtils';

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

    it('should detect CURRENCY_USD format', () => {
      const samples = ['$10.00', '$1,250.50', '$5.00', '$2.50'];
      const result = profileColumnLocally(samples);
      expect(result).toBe('^\\$\\d{1,3}(,\\d{3})*(\\.\\d{2})?$');
    });

    it('should detect INTEGER format', () => {
      const samples = ['10', '250', '3000', '1'];
      const result = profileColumnLocally(samples);
      expect(result).toBe('^\\d+$');
    });

    it('should detect DECIMAL format before falling through to INTEGER', () => {
      const samples = ['10.5', '250.25', '3000.0', '1.1'];
      const result = profileColumnLocally(samples);
      expect(result).toBe('^\\d+\\.\\d+$');
    });

    it('should return null if fewer than 3 samples are provided', () => {
      const samples = ['2026-08-31', '2026-01-15'];
      const result = profileColumnLocally(samples);
      expect(result).toBeNull();
    });

    it('should return null for custom/unrecognized formats (delegating to LLM)', () => {
      const samples = ['INV-2026-001', 'INV-2026-002', 'INV-2026-003'];
      const result = profileColumnLocally(samples);
      expect(result).toBeNull();
    });
  });

  describe('maskToRegex', () => {
    it('should convert custom fixed alphanumeric mask (e.g., INV-2026-001)', () => {
      const mask = 'AAA-9999-999';
      const regexStr = maskToRegex(mask, false);

      expect(regexStr).toBe('^[A-Z]{3}-\\d{4}-\\d{3}$');

      const regex = new RegExp(regexStr);
      expect(regex.test('INV-2026-001')).toBe(true);
      expect(regex.test('inv-2026-001')).toBe(false); // Strict casing
      expect(regex.test('INV-2026-01')).toBe(false); // Length mismatch
    });

    it('should correctly escape special regex characters in punctuation', () => {
      const mask = '$9,999.99';
      const regexStr = maskToRegex(mask, false);

      expect(regexStr).toBe('^\\$\\d{1},\\d{3}\\.\\d{2}$');

      const regex = new RegExp(regexStr);
      expect(regex.test('$1,234.56')).toBe(true);
      expect(regex.test('1234.56')).toBe(false);
    });

    it('should handle bracketed custom codes like [DEFECT-99]', () => {
      const mask = '[AAAAAA-99]';
      const regexStr = maskToRegex(mask, false);

      const regex = new RegExp(regexStr);
      expect(regex.test('[DEFECT-99]')).toBe(true);
      expect(regex.test('DEFECT-99')).toBe(false);
    });

    it('should require the decimal point when mask has one, variable length', () => {
      const regexStr = maskToRegex('9.9', true);
      expect(regexStr).toBe('^\\d+\\.\\d+$');

      const regex = new RegExp(regexStr);
      expect(regex.test('10.5')).toBe(true);
      expect(regex.test('10.555')).toBe(true);
      expect(regex.test('10')).toBe(false); // decimal now required, not optional
    });

    it('should return variable length integer regex when mask is digits-only and isVariableLength is true', () => {
      const regexStr = maskToRegex('999', true);
      expect(regexStr).toBe('^\\d+$');

      const regex = new RegExp(regexStr);
      expect(regex.test('5')).toBe(true);
      expect(regex.test('12345')).toBe(true);
      expect(regex.test('12a')).toBe(false);
    });

    it('should return wildcard .* only for empty masks', () => {
      expect(maskToRegex('', false)).toBe('.*');
      expect(maskToRegex('  ', false)).toBe('.*');
    });

    it('should flex thousands-style digit grouping when variable length', () => {
      const regexStr = maskToRegex('9,999,999', true);
      expect(regexStr).toBe('^\\d{1,3}(,\\d{3})*$');

      const regex = new RegExp(regexStr);
      expect(regex.test('999')).toBe(true);
      expect(regex.test('12,500')).toBe(true);
      expect(regex.test('1,250,000')).toBe(true);
      expect(regex.test('1,25,000')).toBe(false); // malformed grouping
    });

    it('should flex repeated-group counts for non-numeric masks when variable length', () => {
      const regexStr = maskToRegex('AAA-AAA-AAA', true);
      expect(regexStr).toBe('^[A-Z]+(-[A-Z]+)*$');

      const regex = new RegExp(regexStr);
      expect(regex.test('AB')).toBe(true);
      expect(regex.test('AB-CD')).toBe(true);
      expect(regex.test('AB-CD-EF-GH')).toBe(true);
    });

    it('should treat mixed token masks (not a repeating group) as fixed-shape even when variable length', () => {
      const regexStr = maskToRegex('AAA-999', true);
      expect(regexStr).toBe('^[A-Z]+-\\d+$');

      const regex = new RegExp(regexStr);
      expect(regex.test('AB-12')).toBe(true);
      expect(regex.test('ABCDEF-123456')).toBe(true);
      expect(regex.test('AB12')).toBe(false); // separator still required
    });

    it('should preserve a leading literal like a sign character in both length modes', () => {
      expect(maskToRegex('-999', false)).toBe('^-\\d{3}$');
      expect(maskToRegex('-999', true)).toBe('^-\\d+$');

      const regex = new RegExp(maskToRegex('-999', true));
      expect(regex.test('-42')).toBe(true);
      expect(regex.test('42')).toBe(false);
    });
  });
});
