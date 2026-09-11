import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import {
  useElapsedTime,
  UseElapsedTimeOptions,
} from '../../../../src/cli/tui/hooks/useElapsedTime.js';

const TestElapsedTime: React.FC<UseElapsedTimeOptions> = (props) => {
  const { seconds, formatted } = useElapsedTime(props);
  return (
    <Text>
      Sec:{seconds} | Formatted:{formatted}
    </Text>
  );
};

describe('useElapsedTime hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. inicia e incrementa a contagem de tempo decorrido quando isRunning é true', async () => {
    const startTime = Date.now();
    const { lastFrame } = render(
      <TestElapsedTime startTime={startTime} isRunning={true} />
    );

    expect(lastFrame()).toContain('Sec:0 | Formatted:0s');

    vi.advanceTimersByTime(2000);
    await vi.runOnlyPendingTimersAsync();
    expect(lastFrame()).toMatch(/Sec:[23] \| Formatted:[23]s/);
  });

  it('2. interrompe a contagem do cronômetro na chamada de stop', async () => {
    const startTime = Date.now();
    const { lastFrame, rerender } = render(
      <TestElapsedTime startTime={startTime} isRunning={true} />
    );

    vi.advanceTimersByTime(2000);
    await vi.runOnlyPendingTimersAsync();
    const frameBeforeStop = lastFrame();
    expect(frameBeforeStop).toMatch(/Sec:[23] \| Formatted:[23]s/);

    // Interrompe contagem com endTime fixado e isRunning: false
    const stopTime = Date.now();
    rerender(
      <TestElapsedTime startTime={startTime} isRunning={false} endTime={stopTime} />
    );

    vi.advanceTimersByTime(5000);
    await vi.runOnlyPendingTimersAsync();

    // Tempo decorrido permanece congelado no valor de parada
    expect(lastFrame()).toBe(frameBeforeStop);
  });
});
