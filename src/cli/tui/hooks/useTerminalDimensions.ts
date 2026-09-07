import { useState, useEffect, useCallback } from 'react';
import { useStdout } from 'ink';

export type Breakpoint = 'wide' | 'compact' | 'minimal';

export interface TerminalDimensions {
  columns: number;
  rows: number;
  breakpoint: Breakpoint;
}

/**
 * Calculates the active breakpoint based on terminal dimensions.
 * Breakpoints:
 * - 'minimal': columns < 60 || rows < 12
 * - 'wide': columns >= 100 && rows >= 24
 * - 'compact': all other dimensions (columns < 100 || rows < 24, but columns >= 60 && rows >= 12)
 */
export function getBreakpoint(columns: number, rows: number): Breakpoint {
  if (columns < 60 || rows < 12) {
    return 'minimal';
  }
  if (columns >= 100 && rows >= 24) {
    return 'wide';
  }
  return 'compact';
}

/**
 * Hook to detect terminal dimensions and breakpoint changes.
 * Defaults to 80x24 when stdout dimensions are undefined.
 */
export function useTerminalDimensions(): TerminalDimensions {
  const { stdout } = useStdout();

  const getDims = useCallback((): TerminalDimensions => {
    const columns = (stdout && typeof stdout.columns === 'number' && stdout.columns > 0)
      ? stdout.columns
      : 80;
    const rows = (stdout && typeof stdout.rows === 'number' && stdout.rows > 0)
      ? stdout.rows
      : 24;

    return {
      columns,
      rows,
      breakpoint: getBreakpoint(columns, rows),
    };
  }, [stdout]);

  const [dimensions, setDimensions] = useState<TerminalDimensions>(getDims);

  useEffect(() => {
    setDimensions(getDims());

    if (!stdout || typeof stdout.on !== 'function') {
      return;
    }

    const onResize = () => {
      setDimensions(getDims());
    };

    stdout.on('resize', onResize);

    return () => {
      if (typeof stdout.off === 'function') {
        stdout.off('resize', onResize);
      } else if (typeof stdout.removeListener === 'function') {
        stdout.removeListener('resize', onResize);
      }
    };
  }, [stdout, getDims]);

  return dimensions;
}
