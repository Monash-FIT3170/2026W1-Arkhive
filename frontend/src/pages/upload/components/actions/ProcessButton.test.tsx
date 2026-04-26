import { describe, test, expect } from 'vitest';
import { getButtonClasses } from './ProcessButton';

describe('ProcessButton Implementation - getButtonClasses()', function () {

  test('Should return the "Disabled" Tailwind string when isDisabled is true', function () {
    const result = getButtonClasses(true);

    // Proves your implementation uses the correct Tailwind colors
    expect(result).toContain('bg-gray-400');
    expect(result).toContain('cursor-not-allowed');
    expect(result).not.toContain('bg-green-600');
  });

  test('Should return the "Active" Tailwind string when isDisabled is false', function () {
    const result = getButtonClasses(false);

    // Proves your implementation provides visual feedback for enabled state
    expect(result).toContain('bg-green-600');
    expect(result).toContain('hover:bg-green-700');
    expect(result).toContain('cursor-pointer');
  });
});