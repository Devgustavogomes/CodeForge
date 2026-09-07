import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';
import { Box, Text } from 'ink';
import { TimerView } from '../../../../../src/cli/tui/components/common/TimerView.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('TimerView component', () => {
  it('renders default 0s when no startTime is provided', () => {
    const { lastFrame } = render(<TimerView />);
    expect(lastFrame()).toContain('0s');
  });

  it('renders with custom prefix', () => {
    const { lastFrame } = render(<TimerView prefix="⏱ Decorrido: " />);
    expect(lastFrame()).toContain('⏱ Decorrido: 0s');
  });

  it('renders with custom color', () => {
    const { lastFrame } = render(<TimerView color="cyan" prefix="Elapsed: " />);
    expect(lastFrame()).toContain('Elapsed: 0s');
  });

  it('calculates static duration when endTime is provided', () => {
    const startTime = '2026-09-06T10:00:00.000Z';
    const endTime = '2026-09-06T10:01:15.000Z';
    const { lastFrame } = render(
      <TimerView
        startTime={startTime}
        endTime={endTime}
        isRunning={false}
        prefix="Duration: "
      />,
    );

    expect(lastFrame()).toContain('Duration: 1m 15s');
  });

  it('ticks elapsed time when isRunning is true', async () => {
    const startTime = new Date(Date.now() - 2000).toISOString();
    const { lastFrame } = render(
      <TimerView startTime={startTime} isRunning={true} prefix="⏱ " />,
    );

    expect(lastFrame()).toMatch(/⏱ [23]s/);

    await sleep(1050);
    expect(lastFrame()).toMatch(/⏱ [34]s/);
  });

  it('does not tick when isRunning is false', async () => {
    const startTime = new Date(Date.now() - 2000).toISOString();
    const { lastFrame } = render(
      <TimerView startTime={startTime} isRunning={false} prefix="⏱ " />,
    );

    const initialFrame = lastFrame();
    await sleep(1050);
    expect(lastFrame()).toBe(initialFrame);
  });

  it('isolates state updates within TimerView without re-rendering parent component', async () => {
    let parentRenderCount = 0;
    const startTime = new Date(Date.now() - 2000).toISOString();

    const ParentComponent: React.FC = () => {
      parentRenderCount++;
      return (
        <Box flexDirection="column">
          <Text>Parent Header (render count: {parentRenderCount})</Text>
          <TimerView startTime={startTime} isRunning={true} prefix="Timer: " />
        </Box>
      );
    };

    const { lastFrame } = render(<ParentComponent />);
    expect(parentRenderCount).toBe(1);
    expect(lastFrame()).toContain('Parent Header (render count: 1)');
    expect(lastFrame()).toMatch(/Timer: [23]s/);

    // Wait for the internal timer interval in TimerView to tick
    await sleep(1050);

    // Verify TimerView advanced but parent component was NOT re-rendered
    expect(lastFrame()).toMatch(/Timer: [34]s/);
    expect(parentRenderCount).toBe(1);
    expect(lastFrame()).toContain('Parent Header (render count: 1)');
  });
});
