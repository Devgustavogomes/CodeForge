import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import {
  Spinner,
  SPINNER_FRAMES,
  resetSharedSpinnerTicker,
} from '../../../../../src/cli/tui/components/common/Spinner.js';

const advanceTimer = async (ms = 80) => {
  vi.advanceTimersByTime(ms);
  await new Promise((resolve) => setImmediate(resolve));
};

describe('Spinner component', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'],
    });
    resetSharedSpinnerTicker();
  });

  afterEach(() => {
    resetSharedSpinnerTicker();
    vi.useRealTimers();
  });

  it('renders initial frame', () => {
    const { lastFrame, unmount } = render(<Spinner color="cyan" />);
    expect(lastFrame()).toContain(SPINNER_FRAMES[0]);
    unmount();
  });

  it('advances frames when time elapses', async () => {
    const { lastFrame, unmount } = render(<Spinner color="cyan" interval={80} />);
    expect(lastFrame()).toContain(SPINNER_FRAMES[0]);

    await advanceTimer(80);
    expect(lastFrame()).toContain(SPINNER_FRAMES[1]);

    await advanceTimer(80);
    expect(lastFrame()).toContain(SPINNER_FRAMES[2]);

    unmount();
  });

  it('cycles through all animation frames and loops back', async () => {
    const { lastFrame, unmount } = render(<Spinner interval={80} />);

    for (let i = 0; i < SPINNER_FRAMES.length; i++) {
      expect(lastFrame()).toContain(SPINNER_FRAMES[i]);
      await advanceTimer(80);
    }

    // Loops back to first frame
    expect(lastFrame()).toContain(SPINNER_FRAMES[0]);
    unmount();
  });

  it('synchronizes animation frame across multiple mounted spinners', async () => {
    const { lastFrame, unmount } = render(
      <>
        <Spinner label="Task 1" interval={80} />
        <Spinner label="Task 2" interval={80} />
      </>
    );

    expect(lastFrame()).toContain(`${SPINNER_FRAMES[0]} Task 1`);
    expect(lastFrame()).toContain(`${SPINNER_FRAMES[0]} Task 2`);

    await advanceTimer(80);

    expect(lastFrame()).toContain(`${SPINNER_FRAMES[1]} Task 1`);
    expect(lastFrame()).toContain(`${SPINNER_FRAMES[1]} Task 2`);

    unmount();
  });

  it('continues animating remaining spinners when one spinner unmounts', async () => {
    const Harness: React.FC<{ showSecond: boolean }> = ({ showSecond }) => (
      <>
        <Spinner label="Spinner 1" interval={80} />
        {showSecond && <Spinner label="Spinner 2" interval={80} />}
      </>
    );

    const { rerender, lastFrame, unmount } = render(<Harness showSecond={true} />);
    expect(lastFrame()).toContain(`${SPINNER_FRAMES[0]} Spinner 1`);
    expect(lastFrame()).toContain(`${SPINNER_FRAMES[0]} Spinner 2`);

    await advanceTimer(80);
    expect(lastFrame()).toContain(`${SPINNER_FRAMES[1]} Spinner 1`);
    expect(lastFrame()).toContain(`${SPINNER_FRAMES[1]} Spinner 2`);

    // Unmount second spinner: first spinner continues ticking
    rerender(<Harness showSecond={false} />);
    expect(lastFrame()).toContain(`${SPINNER_FRAMES[1]} Spinner 1`);
    expect(lastFrame()).not.toContain('Spinner 2');

    await advanceTimer(80);
    expect(lastFrame()).toContain(`${SPINNER_FRAMES[2]} Spinner 1`);

    unmount();
  });

  it('preserves styling props with label and color', () => {
    const { lastFrame, unmount } = render(<Spinner color="green" label="Executando teste..." />);
    const output = lastFrame() ?? '';
    expect(output).toContain('Executando teste...');
    expect(output).toContain(SPINNER_FRAMES[0]);
    unmount();
  });

  it('cleans up cleanly when unmounted without errors', () => {
    const { unmount } = render(<Spinner color="cyan" />);
    expect(() => unmount()).not.toThrow();
  });
});

