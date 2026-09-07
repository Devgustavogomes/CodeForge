import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  useElapsedTime,
  formatElapsedTime,
  UseElapsedTimeOptions,
} from '../../../../src/cli/tui/hooks/useElapsedTime.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TestElapsedTime: React.FC<UseElapsedTimeOptions> = (props) => {
  const { seconds, formatted } = useElapsedTime(props);
  return (
    <Text>
      Sec:{seconds} | Formatted:{formatted}
    </Text>
  );
};

describe('formatElapsedTime', () => {
  it('formats < 60s as ${s}s', () => {
    expect(formatElapsedTime(0)).toBe('0s');
    expect(formatElapsedTime(5)).toBe('5s');
    expect(formatElapsedTime(59)).toBe('59s');
  });

  it('formats >= 60s as ${m}m ${s}s', () => {
    expect(formatElapsedTime(60)).toBe('1m 0s');
    expect(formatElapsedTime(84)).toBe('1m 24s');
    expect(formatElapsedTime(3599)).toBe('59m 59s');
  });

  it('formats >= 1h as ${h}h ${m}m ${s}s', () => {
    expect(formatElapsedTime(3600)).toBe('1h 0m 0s');
    expect(formatElapsedTime(3665)).toBe('1h 1m 5s');
    expect(formatElapsedTime(7325)).toBe('2h 2m 5s');
  });
});

describe('useElapsedTime hook', () => {
  it('returns formatted 0s when no startTime provided', () => {
    const { lastFrame } = render(<TestElapsedTime />);
    expect(lastFrame()).toContain('Sec:0 | Formatted:0s');
  });

  it('calculates static duration when endTime is provided', () => {
    const startTime = '2026-09-06T10:00:00.000Z';
    const endTime = '2026-09-06T10:01:24.000Z';
    const { lastFrame } = render(
      <TestElapsedTime startTime={startTime} endTime={endTime} isRunning={false} />
    );

    expect(lastFrame()).toContain('Sec:84 | Formatted:1m 24s');
  });

  it('ticks when isRunning is true and startTime is set', async () => {
    // 2 seconds ago
    const startTime = new Date(Date.now() - 2000).toISOString();
    const { lastFrame } = render(
      <TestElapsedTime startTime={startTime} isRunning={true} />
    );

    expect(lastFrame()).toMatch(/Sec:[23] \| Formatted:[23]s/);

    await sleep(1050);
    expect(lastFrame()).toMatch(/Sec:[34] \| Formatted:[34]s/);
  });

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = render(
      <TestElapsedTime startTime={Date.now()} isRunning={true} />
    );

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
