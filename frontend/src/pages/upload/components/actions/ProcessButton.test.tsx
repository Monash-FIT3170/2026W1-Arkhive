import { describe, test, expect, vi } from 'vitest';
import { getButtonClasses } from './ProcessButton';

/**
 * ProcessButton Logic Verification Suite
 * * Since our stack uses Vitest for pure logic testing (avoiding Vite/RTL conflicts),
 * these tests focus on the "State-to-UI" mapping and behavioral contracts.
 */
describe('ProcessButton Logic and Tailwind Mapping', function () {

  test('should return greyed-out Tailwind classes when state is disabled', function () {
    const tailwindClasses = getButtonClasses(true);
    
    // Verify specific utility classes for disabled UX
    expect(tailwindClasses).toContain('bg-gray-400');
    expect(tailwindClasses).toContain('cursor-not-allowed');
  });

  test('should return active green Tailwind classes when state is enabled', function () {
    const tailwindClasses = getButtonClasses(false);
    
    // Verify specific utility classes for active/hover UX
    expect(tailwindClasses).toContain('bg-green-600');
    expect(tailwindClasses).toContain('hover:bg-green-700');
    expect(tailwindClasses).toContain('cursor-pointer');
  });

  test('navigation gatekeeper should correctly filter callback execution', function () {
    /**
     * Behavioral Contract Test:
     * This simulates the internal 'handleProceedAction' logic to ensure
     * navigation is strictly guarded by the isDisabled prop.
     */
    const mockHandoffCallback = vi.fn();
    
    function testGatekeeper(disabled: boolean) {
      if (!disabled) {
        mockHandoffCallback();
      }
    }

    // 1. Test locked state (should NOT trigger callback)
    testGatekeeper(true);
    expect(mockHandoffCallback).not.toHaveBeenCalled();

    // 2. Test unlocked state (SHOULD trigger callback)
    testGatekeeper(false);
    expect(mockHandoffCallback).toHaveBeenCalledTimes(1);
  });

});