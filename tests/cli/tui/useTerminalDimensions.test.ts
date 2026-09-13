import { describe, it, expect } from 'vitest';
import { getBreakpoint } from '../../../src/cli/tui/hooks/useTerminalDimensions.js';

describe('useTerminalDimensions', () => {
  describe('getBreakpoint', () => {
    it('returns "wide" when columns >= 100 and rows >= 24', () => {
      expect(getBreakpoint(100, 24)).toBe('wide');
      expect(getBreakpoint(120, 30)).toBe('wide');
      expect(getBreakpoint(200, 50)).toBe('wide');
    });

    it('returns "compact" when columns < 100 or rows < 24 but above minimal threshold', () => {
      expect(getBreakpoint(80, 24)).toBe('compact');
      expect(getBreakpoint(99, 30)).toBe('compact');
      expect(getBreakpoint(120, 23)).toBe('compact');
      expect(getBreakpoint(60, 12)).toBe('compact');
    });

    it('returns "minimal" when columns < 60 or rows < 12', () => {
      expect(getBreakpoint(59, 24)).toBe('minimal');
      expect(getBreakpoint(100, 11)).toBe('minimal');
      expect(getBreakpoint(50, 10)).toBe('minimal');
      expect(getBreakpoint(40, 5)).toBe('minimal');
    });
  });

  describe('edge cases and boundaries', () => {
    it('handles boundary values correctly', () => {
      // Exactly 60x12 -> compact
      expect(getBreakpoint(60, 12)).toBe('compact');
      // Exactly 100x24 -> wide
      expect(getBreakpoint(100, 24)).toBe('wide');
      // 100x23 -> compact (rows < 24)
      expect(getBreakpoint(100, 23)).toBe('compact');
      // 99x24 -> compact (columns < 100)
      expect(getBreakpoint(99, 24)).toBe('compact');
      // 59x12 -> minimal (columns < 60)
      expect(getBreakpoint(59, 12)).toBe('minimal');
      // 60x11 -> minimal (rows < 12)
      expect(getBreakpoint(60, 11)).toBe('minimal');
      // Extreme small bounds
      expect(getBreakpoint(0, 0)).toBe('minimal');
      expect(getBreakpoint(-1, -1)).toBe('minimal');
    });
  });
});
