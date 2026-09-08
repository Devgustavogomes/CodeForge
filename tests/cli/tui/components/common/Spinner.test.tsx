import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import {
  Spinner,
  SPINNER_FRAMES,
  sharedSpinnerTicker,
  resetSharedSpinnerTicker,
} from '../../../../../src/cli/tui/components/common/Spinner.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Spinner component', () => {
  beforeEach(() => {
    resetSharedSpinnerTicker();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetSharedSpinnerTicker();
  });

  it('renders initial frame', () => {
    const { lastFrame, unmount } = render(<Spinner color="cyan" />);
    expect(lastFrame()).toContain(SPINNER_FRAMES[0]);
    unmount();
  });

  it('advances frames every interval', async () => {
    const { lastFrame, unmount } = render(<Spinner color="cyan" interval={30} />);
    expect(lastFrame()).toContain(SPINNER_FRAMES[0]);

    let advanced = false;
    for (let i = 0; i < 20; i++) {
      await sleep(25);
      if (lastFrame()?.includes(SPINNER_FRAMES[1])) {
        advanced = true;
        break;
      }
    }
    expect(advanced).toBe(true);
    unmount();
  });

  it('cleans up interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = render(<Spinner color="cyan" />);
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('shares a single setInterval timer across multiple mounted Spinner instances', () => {
    const setIntervalSpy = vi.spyOn(global, 'setInterval');

    const { unmount } = render(
      <>
        <Spinner color="cyan" />
        <Spinner color="green" />
        <Spinner color="yellow" />
      </>
    );

    // Three spinners mounted, but only 1 shared setInterval created for interval=80
    expect(sharedSpinnerTicker.getSubscriberCount(80)).toBe(3);
    expect(sharedSpinnerTicker.getActiveTimerCount()).toBe(1);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    unmount();
    expect(sharedSpinnerTicker.getSubscriberCount(80)).toBe(0);
    expect(sharedSpinnerTicker.getActiveTimerCount()).toBe(0);
  });

  it('maintains timer active while at least one spinner is mounted and cancels timer when all spinners unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    const Harness: React.FC<{ showSecond: boolean }> = ({ showSecond }) => (
      <>
        <Spinner color="cyan" />
        {showSecond && <Spinner color="magenta" />}
      </>
    );

    const { rerender, unmount } = render(<Harness showSecond={true} />);
    expect(sharedSpinnerTicker.getSubscriberCount(80)).toBe(2);
    expect(sharedSpinnerTicker.getActiveTimerCount()).toBe(1);

    // Unmount second spinner: 1 remains, interval must NOT be cleared yet
    rerender(<Harness showSecond={false} />);
    expect(sharedSpinnerTicker.getSubscriberCount(80)).toBe(1);
    expect(sharedSpinnerTicker.getActiveTimerCount()).toBe(1);
    expect(clearIntervalSpy).not.toHaveBeenCalled();

    // Unmount the last spinner: interval must now be cancelled
    unmount();
    expect(sharedSpinnerTicker.getSubscriberCount(80)).toBe(0);
    expect(sharedSpinnerTicker.getActiveTimerCount()).toBe(0);
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('synchronizes animation frame across multiple spinners', async () => {
    const { lastFrame, unmount } = render(
      <>
        <Spinner label="Task 1" interval={30} />
        <Spinner label="Task 2" interval={30} />
      </>
    );

    expect(lastFrame()).toContain(`${SPINNER_FRAMES[0]} Task 1`);
    expect(lastFrame()).toContain(`${SPINNER_FRAMES[0]} Task 2`);

    for (let i = 0; i < 20; i++) {
      await sleep(25);
      const frame = lastFrame() ?? '';
      if (frame.includes(SPINNER_FRAMES[1])) {
        break;
      }
    }

    const output = lastFrame() ?? '';
    // Both spinners should have advanced to the exact same frame in sync
    expect(output).toContain(`${SPINNER_FRAMES[1]} Task 1`);
    expect(output).toContain(`${SPINNER_FRAMES[1]} Task 2`);

    unmount();
  });

  it('preserves styling props with label and color', () => {
    const { lastFrame, unmount } = render(<Spinner color="green" label="Executando teste..." />);
    const output = lastFrame() ?? '';
    expect(output).toContain('Executando teste...');
    expect(output).toContain(SPINNER_FRAMES[0]);
    unmount();
  });

  it('resetSharedSpinnerTicker cancels active timers and resets subscriber state', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = render(<Spinner color="cyan" />);

    expect(sharedSpinnerTicker.getActiveTimerCount()).toBe(1);
    expect(sharedSpinnerTicker.getSubscriberCount(80)).toBe(1);

    resetSharedSpinnerTicker();

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(sharedSpinnerTicker.getActiveTimerCount()).toBe(0);
    expect(sharedSpinnerTicker.getSubscriberCount()).toBe(0);

    unmount();
  });
});

